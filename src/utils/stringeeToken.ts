// import jwt from "jsonwebtoken";

// export const generateStringeeToken = (userId: string): string => {
//   const apiKeySid = process.env.STRINGEE_API_KEY_SID!;
//   const apiSecret = process.env.STRINGEE_API_KEY_SECRET!;

//   const now = Math.floor(Date.now() / 1000);
//   const exp = now + 3600; // 1 hour validity

//   const payload = {
//     jti: `${apiKeySid}-${now}`,
//     iss: apiKeySid,
//     exp: exp,
//     userId: userId,
//   };

//   // ✅ Add cty to header options (Mandatory for Stringee)
//   return jwt.sign(payload, apiSecret, {
//     algorithm: "HS256",
//     header: {
//       alg: "HS256",
//       typ: "JWT",
//       cty: "stringeeapi;v=1",
//     },
//   });
// };

import jwt, { JwtHeader, SignOptions } from "jsonwebtoken";

export const generateStringeeToken = (userId: string): string => {
  const apiKeySid = process.env.STRINGEE_API_KEY_SID!;
  const apiSecret = process.env.STRINGEE_API_KEY_SECRET!;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1 hour validity

  const payload = {
    jti: `${apiKeySid}-${now}`,
    iss: apiKeySid,
    exp: exp,
    userId: userId,
  };

  return jwt.sign(payload, apiSecret, {
    algorithm: "HS256",
    header: {
      alg: "HS256",
      typ: "JWT",
      cty: "stringee-api;v=1",
    },
  });
};

export const generateStringeeRestToken = (): string => {
  const apiKeySid = process.env.STRINGEE_API_KEY_SID;
  const apiKeySecret = process.env.STRINGEE_API_KEY_SECRET;

  if (!apiKeySid || !apiKeySecret) {
    throw new Error("Missing Stringee API credentials in .env file");
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // Token valid for 1 hour

  const payload = {
    jti: `${apiKeySid}-${now}`,
    iss: apiKeySid,
    exp: exp,
    rest_api: true, // Required claim for Stringee REST API
  };

  return jwt.sign(payload, apiKeySecret, {
    algorithm: "HS256",
    header: {
      alg: "HS256",
      typ: "JWT",
      cty: "stringee-api;v=1",
      // kid: apiKeySid,
    },
  });
};
