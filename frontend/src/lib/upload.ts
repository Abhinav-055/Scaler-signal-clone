// Direct browser -> Cloudinary upload. Our backend only signs the request; bytes never touch it.
import { api } from "@/lib/api";
import type { AttachmentInput, SignResponse } from "@/lib/types";

export type UploadKind = "avatar" | "attachment";

interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  resource_type: "image" | "video" | "raw";
  bytes: number;
  width?: number;
  height?: number;
}

export async function uploadToCloudinary(
  file: File,
  kind: UploadKind,
  onProgress?: (fraction: number) => void,
): Promise<AttachmentInput> {
  const mimeType = file.type || "application/octet-stream";
  // 1) Ask our backend to validate the file and sign the upload.
  const sig = await api<SignResponse>("/attachments/sign", {
    method: "POST",
    body: { kind, mime_type: mimeType, size_bytes: file.size },
  });

  // 2) Upload straight to Cloudinary. XHR (not fetch) because it reports upload progress.
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.api_key);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);

  const result = await new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", sig.upload_url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else {
        // Surface Cloudinary's own reason (e.g. "File size too large") instead of a generic message.
        let reason = "Please try again.";
        try {
          reason = JSON.parse(xhr.responseText).error.message ?? reason;
        } catch {
          // not JSON; keep the generic reason
        }
        reject(new Error(`Upload failed: ${reason}`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send(form);
  });

  onProgress?.(1);
  return {
    public_id: result.public_id,
    secure_url: result.secure_url,
    resource_type: result.resource_type,
    file_name: file.name,
    mime_type: mimeType,
    size_bytes: result.bytes ?? file.size,
    width: result.width ?? null,
    height: result.height ?? null,
  };
}
