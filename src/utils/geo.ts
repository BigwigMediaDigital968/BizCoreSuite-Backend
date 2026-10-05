const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number): number => {
  return (degrees * Math.PI) / 180;
};

export const calculateDistanceMeters = (
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number => {
  const lat1 = toRadians(latitude1);
  const lat2 = toRadians(latitude2);

  const deltaLatitude = toRadians(latitude2 - latitude1);

  const deltaLongitude = toRadians(longitude2 - longitude1);

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLongitude / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
};
