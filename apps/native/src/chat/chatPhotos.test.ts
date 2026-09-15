import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CHAT_PHOTOS, MAX_PHOTO_DATA_CHARS, PhotoPermissionError,
  preparePhoto, selectPhotos, validatePhotos } from './chatPhotos';
import type { ImagePickerAsset } from 'expo-image-picker';
import { DEFAULT_CHAT_POLICY, setChatConnectionMode, setChatPolicy } from '../../../../shared/remote-chat/policy';

const mocks = vi.hoisted(() => ({ library: vi.fn(), camera: vi.fn(), permission: vi.fn(),
  manipulate: vi.fn(), read: vi.fn() }));
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: mocks.library,
  launchCameraAsync: mocks.camera, requestCameraPermissionsAsync: mocks.permission }));
vi.mock('expo-image-manipulator', () => ({ manipulateAsync: mocks.manipulate, SaveFormat: { JPEG: 'jpeg' } }));
vi.mock('expo-file-system', () => ({ getInfoAsync: async () => ({ exists: true, size: 100 }),
  readAsStringAsync: mocks.read, EncodingType: { Base64: 'base64' } }));
beforeEach(() => { vi.resetAllMocks(); setChatConnectionMode('offline'); setChatPolicy(DEFAULT_CHAT_POLICY); });

describe('chat photos', () => {
  it('preserves original P2P photos above source and transport limits and restores Relay validation', async () => {
    const data = 'YWFh'.repeat(2 * 1024 * 1024);
    mocks.read.mockResolvedValue(data);
    setChatPolicy({ ...DEFAULT_CHAT_POLICY, imageSourceMaxMb: 1 });
    setChatConnectionMode('direct');
    const asset = { uri: 'content://photos/original', mimeType: 'image/png', width: 4000, height: 3000,
      fileSize: 6 * 1024 * 1024 };
    const photo = await preparePhoto(asset);
    expect(photo.dataUrl).toBe(`data:image/png;base64,${data}`);
    expect(mocks.manipulate).not.toHaveBeenCalled();
    expect(() => validatePhotos([photo])).not.toThrow();
    setChatConnectionMode('relay');
    expect(() => validatePhotos([photo])).toThrow('总大小');
    await expect(preparePhoto(asset)).rejects.toThrow('1 MB');
  });
  it('uses updated source and resize limits before processing a selected photo', async () => {
    setChatPolicy({ ...DEFAULT_CHAT_POLICY, imageSourceMaxMb: 1, imageMaxEdge: 512, imageTargetKb: 32 });
    const asset = { uri: 'content://photos/selected', width: 2000, height: 1000, fileSize: 1024 * 1024 + 1 };
    await expect(preparePhoto(asset)).rejects.toThrow('1 MB');
    expect(mocks.manipulate).not.toHaveBeenCalled();
    mocks.manipulate.mockResolvedValue({ uri: 'file:///cache/photo.jpg', base64: 'YQ==' });
    await preparePhoto({ ...asset, fileSize: 100 });
    expect(mocks.manipulate).toHaveBeenCalledWith(asset.uri, [{ resize: { width: 512 } }],
      { format: 'jpeg', compress: 0.8, base64: true });
  });
  it('uses the system photo picker without requesting broad access and preserves cancellation', async () => {
    mocks.library.mockResolvedValue({ canceled: true, assets: null });
    expect(await selectPhotos('library', 3)).toEqual({ canceled: true, assets: null });
    expect(mocks.library).toHaveBeenCalledWith(expect.objectContaining({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 3,
    }));
    expect(mocks.permission).not.toHaveBeenCalled();
  });

  it.each([true, false])('does not open the camera when denied (canAskAgain: %s)', async (canAskAgain) => {
    mocks.permission.mockResolvedValue({ granted: false, canAskAgain });
    await expect(selectPhotos('camera', 1)).rejects.toMatchObject(new PhotoPermissionError(canAskAgain));
    expect(mocks.camera).not.toHaveBeenCalled();
  });

  it('opens the camera after permission is granted', async () => {
    mocks.permission.mockResolvedValue({ granted: true });
    mocks.camera.mockResolvedValue({ canceled: false, assets: [] });
    await selectPhotos('camera', 1);
    expect(mocks.camera).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'] }));
  });

  it('reads the selected URI and sends normalized image bytes instead of a phone file path', async () => {
    const asset: ImagePickerAsset = { uri: 'content://photos/selected', width: 4000, height: 3000 };
    mocks.manipulate.mockResolvedValue({ uri: 'file:///cache/photo.jpg', base64: '/9j/photo' });
    expect(await preparePhoto(asset)).toEqual({ id: 'file:///cache/photo.jpg',
      uri: 'file:///cache/photo.jpg', dataUrl: 'data:image/jpeg;base64,/9j/photo' });
    expect(mocks.manipulate).toHaveBeenCalledWith(asset.uri, [{ resize: { width: 2048 } }],
      { format: 'jpeg', compress: 0.8, base64: true });
  });

  it('rejects a photo that could not be read', async () => {
    mocks.manipulate.mockResolvedValue({ uri: 'file:///cache/empty.jpg', base64: null });
    await expect(preparePhoto({ uri: 'content://photos/empty', width: 100, height: 200 }))
      .rejects.toThrow('照片读取失败');
  });

  it('bounds the photo count and combined message size', () => {
    const photo = { id: 'photo', uri: 'file:///photo', dataUrl: 'data:image/jpeg;base64,photo' };
    expect(() => validatePhotos(Array.from({ length: MAX_CHAT_PHOTOS }, () => photo))).not.toThrow();
    expect(() => validatePhotos(Array.from({ length: MAX_CHAT_PHOTOS + 1 }, () => photo))).toThrow('最多');
    expect(() => validatePhotos([{ ...photo, dataUrl: 'a'.repeat(MAX_PHOTO_DATA_CHARS + 1) }])).toThrow('总大小');
  });
});
