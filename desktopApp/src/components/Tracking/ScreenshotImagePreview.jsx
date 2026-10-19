import { Loader, ImageOff } from 'lucide-react';
import { useEffect } from 'react';
import useScreenshotImage from './useScreenshotImage';

// The viewer mounts its own consumer of the same original-image query used by
// ScreenshotDetailsModal. A cache hit is available during the first render.
export default function ScreenshotImagePreview({ attachment, zoom, rotation, onResolved }) {
  const image = useScreenshotImage(attachment, 'original');
  useEffect(() => {
    onResolved(image.url ? { _id: attachment._id, url: image.url } : null);
  }, [onResolved, attachment._id, image.url]);
  if (image.error) return <div className="text-gray-400 text-center"><ImageOff className="mx-auto mb-2" /><p>{image.error}</p></div>;
  if (!image.url) return <Loader className="w-8 h-8 text-white animate-spin" />;
  return <img src={image.url} alt={attachment.originalName || 'Screenshot'}
    className="max-w-full max-h-full object-contain transition-all duration-200"
    style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }} draggable={false} />;
}
