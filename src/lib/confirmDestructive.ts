import { Alert } from 'react-native';

import { destructiveConfirmationActions } from './destructiveConfirmationPolicy';

export function confirmDestructive({
  title,
  message,
  cancelText,
  destructiveText,
  onConfirm,
}: {
  title: string;
  message: string;
  cancelText: string;
  destructiveText: string;
  onConfirm: () => void;
}): void {
  Alert.alert(title, message, destructiveConfirmationActions(cancelText, destructiveText, onConfirm));
}
