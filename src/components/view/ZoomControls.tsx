import { useLocale } from '../../stores/selectors.js';
import { messagesOf, t as translate } from '../../i18n/index.js';

interface Props {
  zoom: number;
  onChange: (zoom: number) => void;
}

export function ZoomControls({ zoom, onChange }: Props) {
  const m = messagesOf(useLocale());
  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        onClick={() => onChange(Math.max(0.25, zoom - 0.1))}
        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
        data-testid="zoom-out"
        aria-label={translate(m, "zoom.out")}
      >
        −
      </button>
      <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
      <button
        onClick={() => onChange(Math.min(4, zoom + 0.1))}
        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
        data-testid="zoom-in"
        aria-label={translate(m, "zoom.in")}
      >
        +
      </button>
      <button
        onClick={() => onChange(1)}
        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
        data-testid="zoom-reset"
      >
        100%
      </button>
    </div>
  );
}
