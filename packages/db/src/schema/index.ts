export * from "./core";
export * from "./marketing";
export * from "./push";
export * from "./email";
export * from "./common";

import * as core from "./core";
import * as marketing from "./marketing";
import * as push from "./push";
import * as email from "./email";

/** Every table of the PushPanel data model (see BUILD-PLAN §4 + LumaPush email/journey/AI). */
export const allTables = {
  ...core,
  ...marketing,
  ...push,
  ...email,
};