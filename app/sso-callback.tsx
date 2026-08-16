import { Redirect } from 'expo-router';

/**
 * Clerk's native OAuth flow returns to this deep-link path. The browser
 * session normally consumes it before Expo Router renders the route; keeping
 * a real route here prevents Expo Router from showing its unmatched-route
 * screen if Android dispatches the callback to the app first.
 */
export default function SsoCallback() {
  return <Redirect href="/" />;
}
