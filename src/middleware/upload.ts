import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import cloudinary from '../config/cloudinary';
import { ValidationError, AppError } from '../utils/errors';

// ─── Allowed types ────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];

// ─── Multer instances ─────────────────────────────────────────────────────────

// General upload (profile, plant images) — single file
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, or HEIC images are allowed'));
    }
  },
});

// Spread scan upload — up to 4 images, memory storage so Sharp can read buffers
// Used only by POST /api/scans/analyze
export const scanUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 4,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new AppError(
        `Unsupported file type: ${file.mimetype}. Use JPEG, PNG, WebP, or HEIC.`,
        415,
        'UNSUPPORTED_MEDIA_TYPE'
      ) as any);
    }
  },
});

// ─── Cloudinary upload helpers ────────────────────────────────────────────────

/**
 * Upload a Buffer to Cloudinary at a STRUCTURED path.
 *
 * Path pattern (matches your requirement):
 *   profile image  → plantguard/{userId}/profile/image
 *   model scan     → plantguard/{userId}/modelScan/{scanId}
 *   spread scan    → plantguard/{userId}/spreadScan/{scanId}_{index}
 *
 * @param buffer   - raw image bytes
 * @param folder   - Cloudinary folder  e.g. "plantguard/cm123abc/profile"
 * @param publicId - Cloudinary public_id e.g. "image" or "scan_1"
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  publicId: string = 'image'
): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        overwrite: true,
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      }
    ).end(buffer);
  });
}

/** Upload multiple buffers for a spread scan — returns array of URLs */
export async function uploadSpreadScanImages(
  buffers: Buffer[],
  userId: string,
  scanId: string
): Promise<string[]> {
  return Promise.all(
    buffers.map((buf, i) =>
      uploadToCloudinary(
        buf,
        `plantguard/${userId}/spreadScan`,  // folder
        `${scanId}_${i + 1}`                // public_id → e.g. "cmAbc123_1"
      )
    )
  );
}

/** Delete an image from Cloudinary by its public_id */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}

// ─── Middleware factories ─────────────────────────────────────────────────────

/**
 * Uploads req.file to Cloudinary at a STRUCTURED path tied to the user's ID.
 *
 * Usage:
 *   handleImageUpload('profile', 'image')
 *     → folder: plantguard/{userId}/profile
 *     → public_id: image
 *     → full URL: .../plantguard/{userId}/profile/image
 *
 *   handleImageUpload('modelScan', scanId)
 *     → folder: plantguard/{userId}/modelScan
 *     → public_id: {scanId}
 */
// In upload.ts — update the signature:
export function handleImageUpload(
  type: 'profile' | 'modelScan' | 'plant' | 'spreadScan',
  publicId?: string | ((req: Request) => string)   // 👈 allow function
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.file) return next();

      const userId = req.user?.userId;
      if (!userId) return next(new ValidationError('User ID required for image upload'));

      const folder  = `plantguard/${userId}/${type}`;
      const finalId = typeof publicId === 'function'
        ? publicId(req)           // 👈 call it with req
        : publicId ?? 'image';

      req.body.imageUrl = await uploadToCloudinary(req.file.buffer, folder, finalId);
      next();
    } catch {
      next(new ValidationError('Image upload to Cloudinary failed'));
    }
  };
}
