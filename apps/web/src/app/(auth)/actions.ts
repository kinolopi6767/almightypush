"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export type AuthFormState = { error?: string; ok?: boolean } | undefined;

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<NonNullable<AuthFormState>> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    throw error;
  }
  return { ok: true };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}