export * from "./core";
export * from "./marketing";
export * from "./push";
export * from "./common";

import * as core from "./core";
import * as marketing from "./marketing";
import * as push from "./push";

/** Every table of the PushPanel data model (see BUILD-PLAN §4). */
export const allTables = {
  ...core,
  ...marketing,
  ...push,
};