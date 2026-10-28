import { useViewStore } from '../../store/view-store';

interface Props {
  zoom: number;
  onChange: (zoom: number) => void;
}

export function ZoomControls({ zoom, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        onClick={() => onChange(Math.max(0.25, zoom - 0.1))}
        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
      >
        −
      </button>
      <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
      <button
        onClick={() => onChange(Math.min(4, zoom + 0.1))}
        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
      >
        +
      </button>
      <button
        onClick={() => onChange(1)}
        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
      >
        100%
      </button>
    </div>
  );
}
