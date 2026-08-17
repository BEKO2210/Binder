import { AccessibilityInfo } from 'react-native';

export function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}
