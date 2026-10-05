import { Request, Response } from "express";
import { Types } from "mongoose";
import {
  generateStringeeToken,
  generateStringeeRestToken,
} from "../utils/stringeeToken.js";
import { CallLog } from "../models/CallLog.js";
import { Lead } from "../models/Lead.js";
import { createLeadActivity } from "../services/lead.service.js";
import { User } from "../models/User.js";
import { StringeeNumber } from "../models/StringeeNumber.js";
import axios from "axios";

export const getStringeeTokenController = async (
  req: Request,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = generateStringeeToken(req.user.id.toString());
    return res.status(200).json({ success: true, token });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * Stringee Answer URL Webhook
 * Returned SCCO structure per Stringee Web SDK specification
 */
export const handleAnswerUrlWebhook = async (req: Request, res: Response) => {
  console.log("=== [STRINGEE ANSWER URL WEBHOOK TRIGGERED] ===");
  console.log("Query:", JSON.stringify(req.query, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  try {
    const body = req.body || {};
    const query = req.query || {};

    const rawTo = query.to || body.to || "";
    const rawFrom = query.from || body.from || "";

    const rawCustomData =
      query.custom_data ||
      body.custom_data ||
      query.customData ||
      body.customData ||
      "";

    let customDataString = "";
    if (typeof rawCustomData === "object") {
      customDataString = JSON.stringify(rawCustomData);
    } else {
      customDataString = String(rawCustomData);
    }

    const cleanTo = String(rawTo).replace(/[^\d+]/g, "");

    // 1. Dynamic Caller ID Resolution
    let outboundCallerId =
      process.env.STRINGEE_HOTLINE_NUMBER || "917944412839";

    if (rawFrom) {
      const assignedNumberDoc = await StringeeNumber.findOne({
        assignedTo: rawFrom,
        isActive: true,
      }).lean();

      if (assignedNumberDoc?.phoneNumber) {
        outboundCallerId = assignedNumberDoc.phoneNumber;
      }
    }

    const cleanCallerId = String(outboundCallerId).replace(/[^\d+]/g, "");
    const eventWebhookUrl = `${process.env.BACKEND_URL}/api/v1/dialer/events`;

    // 2. Standard Stringee SCCO Payload Response
    const scco = [
      {
        action: "record",
        eventUrl: eventWebhookUrl,
        format: "wav",
      },
      {
        action: "connect",
        from: {
          type: "internal",
          number: cleanCallerId,
          alias: cleanCallerId,
        },
        to: {
          type: "external",
          number: cleanTo,
          alias: cleanTo,
        },
        customData: customDataString,
        timeout: 60,
      },
    ];

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(scco);
  } catch (error: any) {
    console.error("[Stringee Webhook Error]:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Stringee Call Events Webhook
 * Manages Call Status, Call Failures/Unanswered calls, and Recording URLs
 */
export const handleCallEventsWebhook = async (req: Request, res: Response) => {
  console.log("=== [STRINGEE EVENT WEBHOOK TRIGGERED] ===");
  console.log("Query:", JSON.stringify(req.query, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  try {
    const payload = { ...req.query, ...req.body };

    const {
      call_id,
      call_status,
      event_type,
      action,
      duration,
      answerDuration,
      record_url,
      recording_url,
      recordUrl,
      request_from_user_id,
      actor,
      from,
      to,
      sip_code,
      reason,
    } = payload;

    if (!call_id) {
      return res.status(200).json({ status: "ignored_no_call_id" });
    }

    // Capture recording URL across all potential payload keys
    const finalRecordingUrl =
      record_url ||
      recording_url ||
      recordUrl ||
      payload?.recording?.url ||
      payload?.recording_url ||
      "";

    const rawEventType = String(
      event_type || action || call_status || "",
    ).toLowerCase();

    // ------------------------------------------------------------------------
    // 1. DEDICATED ASYNC RECORDING EVENT HANDLER
    // Stringee posts recording URLs after the call session ends.
    // ------------------------------------------------------------------------
    if (rawEventType.includes("record") || finalRecordingUrl) {
      if (finalRecordingUrl) {
        await CallLog.findOneAndUpdate(
          { callId: call_id },
          { $set: { recordingUrl: finalRecordingUrl } },
          { upsert: true },
        );
        return res.status(200).json({ status: "recording_updated" });
      }
    }

    // ------------------------------------------------------------------------
    // 2. PARSE PHONE NUMBERS & METADATA
    // ------------------------------------------------------------------------
    const callerFrom =
      (typeof from === "object" ? from?.number : from) || "Unknown";
    const callerTo = (typeof to === "object" ? to?.number : to) || "Unknown";

    const rawUserId = request_from_user_id || actor;
    let userId: string | null = null;
    let branchId: string | null = null;

    if (rawUserId) {
      const user = await User.findById(rawUserId).select("_id branches").lean();
      if (user) {
        userId = user._id.toString();
        if (user.branches?.length) {
          branchId = Array.isArray(user.branches)
            ? user?.branches[0]?.toString()
            : (user.branches as any).toString();
        }
      }
    }

    // Map Lead by destination phone number (last 10 digits match)
    let leadId: string | null = null;
    if (callerTo && callerTo !== "Unknown") {
      const cleanPhone = String(callerTo).slice(-10);
      const matchedLead = await Lead.findOne({
        phone: new RegExp(cleanPhone + "$"),
        isDeleted: { $ne: true },
      })
        .select("_id")
        .lean();

      if (matchedLead) {
        leadId = matchedLead._id.toString();
      }
    }

    // ------------------------------------------------------------------------
    // 3. COMPLETE CALL STATUS NORMALIZATION
    // Handles picked, unpicked, busy, rejected, and failed connections
    // ------------------------------------------------------------------------
    let normalizedStatus:
      | "started"
      | "answered"
      | "ended"
      | "missed"
      | "rejected"
      | "failed" = "started";

    const combinedReason = String(reason || "").toLowerCase();

    // On the `ended` event Stringee's `duration` is the whole call INCLUDING
    // ringing; `answerDuration` is the talk time (0 when nobody picked up).
    // Using `duration` marked every rung-but-unanswered call as "ended" — and
    // Stringee never records those, which looked like missing recordings.
    const talkSeconds =
      answerDuration !== undefined
        ? parseInt(String(answerDuration), 10) || 0
        : parseInt(String(duration || "0"), 10) || 0;

    if (
      rawEventType.includes("ended") ||
      rawEventType.includes("completed") ||
      rawEventType.includes("hangup")
    ) {
      normalizedStatus = talkSeconds > 0 ? "ended" : "missed";
    } else if (
      rawEventType.includes("answered") ||
      rawEventType.includes("accept")
    ) {
      normalizedStatus = "answered";
    } else if (
      rawEventType.includes("busy") ||
      rawEventType.includes("user_busy") ||
      combinedReason.includes("busy")
    ) {
      normalizedStatus = "rejected";
    } else if (
      rawEventType.includes("no_answer") ||
      rawEventType.includes("missed") ||
      rawEventType.includes("timeout") ||
      combinedReason.includes("timeout") ||
      combinedReason.includes("no answer")
    ) {
      normalizedStatus = "missed";
    } else if (
      rawEventType.includes("reject") ||
      rawEventType.includes("cancel") ||
      combinedReason.includes("rejected")
    ) {
      normalizedStatus = "rejected";
    } else if (
      rawEventType.includes("failed") ||
      sip_code >= 400 ||
      combinedReason.includes("unallocated") ||
      combinedReason.includes("failed")
    ) {
      normalizedStatus = "failed";
    }

    // ------------------------------------------------------------------------
    // 4. UPSERT CALL LOG RECORD
    // ------------------------------------------------------------------------
    const updateData: any = {
      callStatus: normalizedStatus,
      fromNumber: String(callerFrom),
      toNumber: String(callerTo),
    };

    // Store talk time (0 if the call was not connected/answered)
    if (["missed", "rejected", "failed"].includes(normalizedStatus)) {
      updateData.duration = 0;
    } else if (answerDuration !== undefined || duration !== undefined) {
      updateData.duration = talkSeconds;
    }

    if (finalRecordingUrl) updateData.recordingUrl = finalRecordingUrl;
    if (userId) updateData.caller = userId;
    if (branchId) updateData.branch = branchId;
    if (leadId) updateData.lead = leadId;

    const updatedLog = await CallLog.findOneAndUpdate(
      { callId: call_id },
      { $set: updateData },
      { upsert: true, returnDocument: "after" },
    );

    // ------------------------------------------------------------------------
    // 5. CREATE LEAD ACTIVITY RECORD
    // ------------------------------------------------------------------------
    if (
      leadId &&
      userId &&
      ["ended", "missed", "rejected"].includes(normalizedStatus)
    ) {
      const callDuration = updateData.duration || 0;
      let statusRemark = `Outbound call ${normalizedStatus}.`;
      if (normalizedStatus === "ended") {
        statusRemark = `Outbound call ended. Duration: ${callDuration}s`;
      } else if (normalizedStatus === "missed") {
        statusRemark = `Outbound call unanswered (No answer / Timeout).`;
      } else if (normalizedStatus === "rejected") {
        statusRemark = `Outbound call rejected (Line busy).`;
      }

      await createLeadActivity({
        leadId,
        activityType: "call_logged",
        performedBy: userId,
        remark: statusRemark,
        metadata: {
          callId: call_id,
          recordingUrl: updatedLog?.recordingUrl || finalRecordingUrl,
          branchId,
          status: normalizedStatus,
          duration: callDuration,
        },
      });
    }

    return res.status(200).json({ status: "success" });
  } catch (error: any) {
    console.error("[Call Event Error]:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const getLeadCallHistoryController = async (
  req: Request,
  res: Response,
) => {
  try {
    const { leadId } = req.params;

    const lead = await Lead.findById(leadId);
    if (!lead || lead.isDeleted) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const query: any = { lead: leadId };

    if (req.user?.role !== "head") {
      query.caller = req.user?.id;
    } else if (req.user?.branches) {
      query.branch = Array.isArray(req.user.branches)
        ? { $in: req.user.branches }
        : req.user.branches;
    }

    const calls = await CallLog.find(query)
      .populate("caller", "name email role")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: calls });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const getCallLogs = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    const { status, leadId, userId, branchId, search, startDate, endDate } =
      req.query;

    const filter: any = {};

    const toObjectId = (value: unknown): unknown => {
      const raw = String(value);
      return Types.ObjectId.isValid(raw) ? new Types.ObjectId(raw) : value;
    };

    if (req.user?.role !== "head") {
      filter.caller = toObjectId(req.user?.id);
    } else {
      if (userId) filter.caller = toObjectId(userId);
      if (branchId) filter.branch = toObjectId(branchId);
    }

    if (status) filter.callStatus = status;
    if (leadId) filter.lead = toObjectId(leadId);

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    if (search) {
      const searchRegex = new RegExp(String(search), "i");

      const matchedLeads = await Lead.find({
        $or: [{ name: searchRegex }, { phone: searchRegex }],
        isDeleted: { $ne: true },
      })
        .select("_id")
        .lean();

      const matchedUsers = await User.find({
        name: searchRegex,
      })
        .select("_id")
        .lean();

      const leadIds = matchedLeads.map((l) => l._id);
      const userIds = matchedUsers.map((u) => u._id);

      filter.$or = [
        { toNumber: searchRegex },
        { fromNumber: searchRegex },
        ...(leadIds.length > 0 ? [{ lead: { $in: leadIds } }] : []),
        ...(userIds.length > 0 ? [{ caller: { $in: userIds } }] : []),
      ];
    }

    const [logs, total, summary] = await Promise.all([
      CallLog.find(filter)
        .populate("lead", "name phone email company avatar")
        .populate("caller", "name email avatar")
        .populate("branch", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CallLog.countDocuments(filter),
      CallLog.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalSeconds: { $sum: { $ifNull: ["$duration", 0] } },
            answeredCalls: {
              $sum: {
                $cond: [{ $in: ["$callStatus", ["answered", "ended"]] }, 1, 0],
              },
            },
            missedCalls: {
              $sum: {
                $cond: [
                  { $in: ["$callStatus", ["missed", "rejected", "failed"]] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const stats = {
      totalCalls: summary[0]?.totalCalls ?? 0,
      totalSeconds: summary[0]?.totalSeconds ?? 0,
      answeredCalls: summary[0]?.answeredCalls ?? 0,
      missedCalls: summary[0]?.missedCalls ?? 0,
    };

    return res.status(200).json({
      success: true,
      data: logs,
      stats,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("[Get Call Logs Error]:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const getCallLogById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const log = await CallLog.findById(id)
      .populate("lead")
      .populate("caller", "name email")
      .populate("branch", "name")
      .lean();

    if (!log) {
      return res.status(404).json({ message: "Call log record not found" });
    }

    return res.status(200).json({ success: true, data: log });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const proxyRecordingAudio = async (req: Request, res: Response) => {
  try {
    const { recordingUrl } = req.query;

    if (!recordingUrl || typeof recordingUrl !== "string") {
      return res
        .status(400)
        .json({ message: "recordingUrl query parameter is required" });
    }

    // 1. Only real Stringee hosts — a loose `includes("stringee.com")` check
    // would let any URL through and leak our REST token to it
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(recordingUrl.trim());
    } catch {
      return res.status(400).json({ message: "Invalid recording URL" });
    }
    const host = parsedUrl.hostname.toLowerCase();
    if (host !== "stringee.com" && !host.endsWith(".stringee.com")) {
      return res.status(403).json({ message: "Invalid recording URL domain" });
    }

    // 2. Stringee stores `http://api.stringee.com/...` URLs, but that host is
    // geo-routed: from a non-Asia server (e.g. Render) it lands on a region that
    // rejects our asia-2 key with `keySid invalid`. Call the project's region.
    const apiBase = (
      process.env.STRINGEE_API_BASE_URL || "https://asia-2.api.stringee.com"
    ).replace(/\/+$/, "");
    const cleanUrl = `${apiBase}${parsedUrl.pathname}${parsedUrl.search}`;

    // 3. Generate REST API Token
    const stringeeToken = generateStringeeRestToken();

    // 4. Request audio stream from Stringee using `X-STRINGEE-AUTH`. The
    // browser's Range header is passed through so seeking works (Safari needs it).
    const response = await axios({
      method: "get",
      url: cleanUrl,
      headers: {
        "X-STRINGEE-AUTH": stringeeToken,
        "Accept-Encoding": "identity",
        ...(req.headers.range && { Range: req.headers.range }),
      },
      responseType: "stream",
      decompress: false,
      validateStatus: () => true, // Capture response statuses
    });

    const rawContentType = response.headers["content-type"];
    const contentType =
      typeof rawContentType === "string" ? rawContentType : "audio/mpeg";

    // 5. Handle error / JSON responses from Stringee
    if (
      contentType.includes("application/json") ||
      (response.status !== 200 && response.status !== 206)
    ) {
      let rawData = "";
      response.data.on(
        "data",
        (chunk: Buffer) => (rawData += chunk.toString())
      );
      response.data.on("end", () => {
        console.error(`[Stringee Audio Stream Error ${response.status}]:`, rawData);
        return res.status(response.status || 401).json({
          message: "Stringee audio access rejected",
          error: rawData,
        });
      });
      return;
    }

    // 6. Send CORS & Streaming headers to the browser
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);

    for (const header of ["content-length", "content-range"]) {
      if (response.headers[header]) {
        res.setHeader(header, String(response.headers[header]));
      }
    }

    res.status(response.status);
    return response.data.pipe(res);
  } catch (error: any) {
    console.error(
      "[Audio Proxy Error]:",
      error?.response?.data || error.message
    );
    return res
      .status(500)
      .json({ message: "Failed to stream recording audio" });
  }
};
