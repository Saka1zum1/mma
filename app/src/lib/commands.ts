import { commands } from "@/bindings.gen";

export type Cmd = typeof commands;

export const cmd: Cmd = commands;
