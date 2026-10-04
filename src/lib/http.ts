import { NextResponse } from "next/server";

export function jsonError(status: number, code: string, message: string, extra?: object) {
  return NextResponse.json({ code, message, ...extra }, { status });
}
