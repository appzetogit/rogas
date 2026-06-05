import { toast } from "sonner";

/**
 * Robust file download utility implemented based on working SwitcheatsV2 logic.
 * This approach uses standard Blob URLs with specific MIME types which is 
 * proven to work in Flutter WebViews.
 */
export const downloadFile = ({ data, filename, type }) => {
  console.log(`[DownloadUtils] Starting download: ${filename} (${type})`);
  
  try {
    // 1. Create a blob from the data with explicit type
    // This MIME type helps mobile OS identify the file correctly
    const blob = data instanceof Blob ? data : new Blob([data], { type });

    // 2. Create a URL for the blob
    const url = window.URL.createObjectURL(blob);
    
    // 3. Create a temporary anchor element
    const link = document.createElement('a');
    link.href = url;
    
    // 4. Set the download attribute with the filename
    link.setAttribute('download', filename);
    
    // 5. Use visibility:hidden instead of display:none (matches SwitcheatsV2)
    link.style.visibility = 'hidden';
    link.style.position = 'absolute';
    
    // 6. Append to body, click, and remove
    document.body.appendChild(link);
    link.click();
    
    // 7. Cleanup after a short delay
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      link.remove();
      console.log(`[DownloadUtils] Download triggered and cleaned up`);
    }, 150);

    // Provide user feedback
    toast.success("Download started successfully");
    
  } catch (error) {
    console.error("[DownloadUtils] Download failed:", error);
    toast.error("Failed to start download. Please try again.");
  }
};
