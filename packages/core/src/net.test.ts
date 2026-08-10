import { describe, expect, it } from "vitest";
import { isPrivateIp } from "./net";

describe("isPrivateIp", () => {
  it("flags private IPv4 ranges", () => {
    for (const ip of ["10.0.0.1", "172.16.5.5", "192.168.1.1", "127.0.0.1", "169.254.1.2", "0.0.0.1", "100.64.0.1", "192.0.0.10", "198.18.0.1", "224.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("accepts public IPv4 addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.7", "172.32.0.1", "100.128.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it("flags private IPv6 ranges", () => {
    for (const ip of ["::1", "::", "fc00::1", "fdf8::1", "fe80::1", "febf:abcd::1", "2001:db8::1", "2001:db8:1234::", "2001:10::1", "2001:20::1", "64:ff9b::1", "100::1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("accepts public IPv6 addresses", () => {
    for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "2a00:1450:4001::1", "2001:db9::1", "2002:db8::1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it("normalizes IPv4-mapped IPv6", () => {
    expect(isPrivateIp("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });
});