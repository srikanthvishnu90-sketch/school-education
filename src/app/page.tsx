import type { ReactElement } from "react";
import SignInScreen from "./signin/SignInScreen";

/**
 * The root is the single entry surface — the same screen served at /signin. One
 * front door: it says what plumb is and signs you in. Signed-in visitors are
 * redirected to their own home inside SignInScreen.
 */
export default async function Home(): Promise<ReactElement> {
  return <SignInScreen />;
}
