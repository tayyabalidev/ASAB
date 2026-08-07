/**
 * Appwrite schema reference for Friends Live Location (Step 1 — backend only).
 *
 * Create the collection + attributes + indexes in Appwrite Console first.
 * See: docs/FRIENDS_LIVE_LOCATION_BACKEND.md
 *
 * After creation, set EXPO_PUBLIC_USER_LOCATIONS_COLLECTION_ID (or paste the
 * collection ID into lib/appwrite.js) before Step 2 (maps / mobile).
 */

/** Privacy modes stored on each location document. */
export const LOCATION_PRIVACY_MODES = {
  EVERYONE: "everyone",
  FRIENDS: "friends",
  SELECTED: "selected",
  GHOST: "ghost",
};

export const LOCATION_PRIVACY_MODE_VALUES = [
  LOCATION_PRIVACY_MODES.EVERYONE,
  LOCATION_PRIVACY_MODES.FRIENDS,
  LOCATION_PRIVACY_MODES.SELECTED,
  LOCATION_PRIVACY_MODES.GHOST,
];

/**
 * How “fresh” a location must be to show as Live / “Now”.
 * Older updates show as Last Seen (e.g. “15m ago”).
 */
export const LOCATION_LIVE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Default throttle for client writes (used later in Step 2+).
 * Not an Appwrite setting — documented here for consistency.
 */
export const LOCATION_UPDATE_INTERVAL_MS = 15 * 1000; // 15 seconds
export const LOCATION_UPDATE_DISTANCE_M = 50; // meters

/** Step 5 — nearby alert defaults (client did not specify; tune later). */
export const LOCATION_NEARBY_RADIUS_M = 1000; // 1 km
export const LOCATION_NEARBY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // once per friend per day

/** Background GPS cadence (battery-friendly; not continuous streaming). */
export const LOCATION_BG_TIME_INTERVAL_MS = 60 * 1000;
export const LOCATION_BG_DISTANCE_INTERVAL_M = 100;

export const LOCATION_BG_TASK_NAME = "ASAB_FRIENDS_LOCATION_BG";
export const LOCATION_SHARING_PREFS_KEY = "@asab_location_sharing_prefs";
export const LOCATION_NEARBY_NOTIFIED_KEY = "@asab_location_nearby_notified";

/**
 * Collection: userLocations
 * One document per user (document ID should equal the users collection $id
 * OR use a unique index on userId — prefer document ID = userId for upserts).
 */
export const USER_LOCATIONS_COLLECTION = {
  name: "userLocations",
  /**
   * Step 1 test: documentSecurity = false + collection permissions is OK.
   * Before production: enable Document Security and set per-doc read roles
   * for Selected Friends / Ghost Mode.
   */
  documentSecurity: false,
  attributes: [
    {
      key: "userId",
      type: "String",
      size: 36,
      required: true,
      array: false,
      note: "users collection document $id",
    },
    {
      key: "latitude",
      type: "Float",
      required: false,
      note: "null/omit when Ghost or not sharing",
    },
    {
      key: "longitude",
      type: "Float",
      required: false,
      note: "null/omit when Ghost or not sharing",
    },
    {
      key: "accuracy",
      type: "Float",
      required: false,
      note: "GPS accuracy in meters",
    },
    {
      key: "heading",
      type: "Float",
      required: false,
      note: "degrees 0–360 if available",
    },
    {
      key: "speed",
      type: "Float",
      required: false,
      note: "m/s if available",
    },
    {
      key: "altitude",
      type: "Float",
      required: false,
    },
    {
      key: "placeLabel",
      type: "String",
      size: 255,
      required: false,
      note: 'Cached reverse-geocode e.g. "SoHo, New York"',
    },
    {
      key: "isSharing",
      type: "Boolean",
      required: true,
      default: false,
      note: "false = not visible on friends’ maps",
    },
    {
      key: "privacyMode",
      type: "String",
      size: 16,
      required: true,
      default: LOCATION_PRIVACY_MODES.GHOST,
      note: "everyone | friends | selected | ghost",
    },
    {
      key: "allowedViewerIds",
      type: "String",
      size: 36,
      required: false,
      array: true,
      note: "User IDs allowed when privacyMode = selected",
    },
    {
      key: "lastSeenAt",
      type: "DateTime",
      required: false,
      note: "Last time a valid location was published (for Last Seen labels)",
    },
    {
      key: "updatedAtClient",
      type: "DateTime",
      required: false,
      note: "Device timestamp of the GPS fix (optional; $updatedAt also exists)",
    },
  ],
  indexes: [
    {
      name: "userId_unique",
      type: "unique",
      attributes: ["userId"],
      orders: ["ASC"],
    },
    {
      name: "sharing_mode_idx",
      type: "key",
      attributes: ["isSharing", "privacyMode"],
      orders: ["ASC", "ASC"],
    },
    {
      name: "lastSeen_idx",
      type: "key",
      attributes: ["lastSeenAt"],
      orders: ["DESC"],
    },
  ],
};

/**
 * Optional attributes on existing `users` collection (settings UX only).
 * Coordinates must NOT live on users — keep them in userLocations.
 */
export const USERS_LOCATION_OPTIONAL_ATTRIBUTES = [
  {
    key: "locationSharingEnabled",
    type: "Boolean",
    required: false,
    default: false,
    note: "Quick flag for settings UI; source of truth is userLocations.isSharing",
  },
  {
    key: "locationPrivacyMode",
    type: "String",
    size: 16,
    required: false,
    default: LOCATION_PRIVACY_MODES.GHOST,
    note: "Mirror of userLocations.privacyMode for profile settings",
  },
];
