import multer from "multer";
import cloudinary from "cloudinary";

const isCloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      !process.env.CLOUDINARY_CLOUD_NAME.startsWith("your-") &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

if (isCloudinaryConfigured()) {
  cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE_MB || "20") || 20) * 1024 * 1024 },
});

export async function saveFile(file, folder = "uploads") {
  const buffer = file.buffer || Buffer.alloc(0);
  if (isCloudinaryConfigured()) {
    const res = await new Promise((resolve, reject) => {
      cloudinary.v2.uploader
        .upload_stream({ folder: `${process.env.CLOUDINARY_FOLDER || "college_ai"}/${folder}`, resource_type: "auto" }, (err, result) =>
          err ? reject(err) : resolve(result)
        )
        .end(buffer);
    });
    return { url: res.secure_url, publicId: res.public_id, storage: "cloudinary" };
  }
  return { url: `data:${file.mimetype || "application/octet-stream"};base64,${buffer.toString("base64")}`, publicId: null, storage: "local" };
}

export async function deleteFile(publicId) {
  if (!publicId) return;
  if (!isCloudinaryConfigured()) return;
  try {
    await cloudinary.v2.uploader.destroy(publicId);
  } catch (e) {
    /* best-effort */
  }
}
