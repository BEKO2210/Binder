export type DestructiveConfirmationAction = {
  text: string;
  style: 'cancel' | 'destructive';
  onPress?: () => void;
};

export function destructiveConfirmationActions(
  cancelText: string,
  destructiveText: string,
  onConfirm: () => void,
): DestructiveConfirmationAction[] {
  return [
    { text: cancelText, style: 'cancel' },
    { text: destructiveText, style: 'destructive', onPress: onConfirm },
  ];
}
