import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const MAX_EDGE = 1080;

export type PreparedImage = {
  uri: string;
  width: number;
  height: number;
  mimeType: 'image/webp';
};

export async function pickAndPrepareProfileImage(): Promise<PreparedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const scale = Math.min(1, MAX_EDGE / Math.max(asset.width, asset.height));
  const width = Math.max(1, Math.round(asset.width * scale));
  const height = Math.max(1, Math.round(asset.height * scale));

  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  if (scale < 1) context.resize({ width, height });

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: 0.8,
    format: ImageManipulator.SaveFormat.WEBP,
  });

  return {
    uri: saved.uri,
    width,
    height,
    mimeType: 'image/webp',
  };
}
