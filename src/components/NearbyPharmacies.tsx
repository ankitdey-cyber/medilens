import React from 'react';
import { CheckCircle2, Clock, MapPin, Navigation, RefreshCw, XCircle } from 'lucide-react';
import { PharmacySearchResponse } from '../types/medilens';

interface NearbyPharmaciesProps {
  data: PharmacySearchResponse | null;
  isLoading: boolean;
  error: string | null;
  coords: { lat: number; lng: number };
  hasGpsLock: boolean;
  locationNotice: string | null;
  onRefresh: () => void;
}

export const NearbyPharmacies: React.FC<NearbyPharmaciesProps> = ({
  data,
  isLoading,
  error,
  coords,
  hasGpsLock,
  locationNotice,
  onRefresh,
}) => {
  return (
    <section id="pharmacies" className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Nearby Pharmacies (Open vs. Closed)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            <MapPin className="w-3.5 h-3.5 inline mr-1 -mt-0.5" aria-hidden="true" />
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)} ·{' '}
            {hasGpsLock ? 'Browser GPS' : 'Default city coordinates'}
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh GPS
        </button>
      </div>

      {locationNotice && (
        <div
          role="status"
          className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950"
        >
          {locationNotice}
        </div>
      )}

      {isLoading && (
        <p className="py-4 text-sm text-slate-600">
          Searching nearby pharmacies and checking hours via Google Maps...
        </p>
      )}

      {!isLoading && !error && !data && (
        <p className="py-4 text-sm text-slate-500">
          Scan a medicine or tap Refresh GPS to check open and closed pharmacies nearby.
        </p>
      )}

      {!isLoading && error && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3.5 text-sm text-amber-950">
          Could not load nearby pharmacies: {error}
        </div>
      )}

      {!isLoading && !error && data && (
        <div className="mt-3 space-y-3">
          {data.places.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {data.places.map((place) => {
                const statusLabel =
                  place.openNow === true
                    ? 'Open now'
                    : place.openNow === false
                      ? 'Closed'
                      : 'Check hours';
                const statusClass =
                  place.openNow === true
                    ? 'text-emerald-700'
                    : place.openNow === false
                      ? 'text-rose-700'
                      : 'text-slate-600';
                const StatusIcon =
                  place.openNow === true
                    ? CheckCircle2
                    : place.openNow === false
                      ? XCircle
                      : Clock;

                return (
                  <li
                    key={place.uri}
                    className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className={`inline-flex items-center gap-1 text-xs font-semibold ${statusClass}`}>
                        <StatusIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{statusLabel}</span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-slate-500 font-normal">Google Maps</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 truncate mt-0.5">
                        {place.title}
                      </p>
                      {place.snippet && (
                        <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{place.snippet}</p>
                      )}
                    </div>

                    <a
                      href={place.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
                      Maps
                    </a>
                  </li>
                );
              })}
            </ul>
          )}

          {data.summaryText && (
            <div className="pt-3 border-t border-slate-100 text-xs text-slate-700 whitespace-pre-line leading-relaxed">
              {data.summaryText}
            </div>
          )}

          {data.places.length === 0 && !data.summaryText && (
            <p className="text-sm text-slate-600 py-2">No nearby pharmacy details were returned.</p>
          )}
        </div>
      )}
    </section>
  );
};
