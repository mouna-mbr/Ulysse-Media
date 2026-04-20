import { useEffect } from 'react';

function ImageLightbox({ images, currentIndex, onClose, onPrev, onNext }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') onPrev();
      if (event.key === 'ArrowRight') onNext();
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, onPrev, onNext]);

  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <span className="material-symbols-outlined">close</span>
      </button>

      {images.length > 1 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPrev();
          }}
          className="absolute left-4 md:left-8 w-11 h-11 rounded-full bg-white/15 text-white hover:bg-white/25"
          aria-label="Image precedente"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
      )}

      <div className="max-w-6xl w-full" onClick={(event) => event.stopPropagation()}>
        <img
          src={currentImage.url}
          alt={currentImage.label || 'Image'}
          className="w-full max-h-[82vh] object-contain rounded-2xl"
        />
        <div className="mt-3 flex items-center justify-between text-white/90 text-sm">
          <p className="truncate pr-4">{currentImage.label || 'Image'}</p>
          <p>{currentIndex + 1} / {images.length}</p>
        </div>
      </div>

      {images.length > 1 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNext();
          }}
          className="absolute right-4 md:right-8 w-11 h-11 rounded-full bg-white/15 text-white hover:bg-white/25"
          aria-label="Image suivante"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      )}
    </div>
  );
}

export default ImageLightbox;
