import type { Metadata } from "next";
import type { ReactElement } from "react";
import SignInScreen from "./SignInScreen";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to plumb — honest classroom reflection for K-12.",
};

export default async function SignInPage(): Promise<ReactElement> {
  return <SignInScreen />;
}
