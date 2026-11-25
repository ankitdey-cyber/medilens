import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bug,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';
import { buildPharmacyAppLinks } from '../constants/languages';
import { MedicineDetails, ScanDebugInfo, ScanStage } from '../types/medilens';

interface MedicineResultsProps {
  medicine: MedicineDetails | null;
  langName: string;
  statusMessage: {
    type: 'info' | 'loading' | 'success' | 'warning' | 'danger';
    text: string;
  };
  errorStage: ScanStage | null;
  debugInfo: ScanDebugInfo | null;
  needsRefreshForSettings: boolean;
  canRetryScan: boolean;
  onRefreshScan: () => void;
  isScanning: boolean;
}

const STAGE_LABELS: Record<ScanStage, string> = {
  camera_capture: 'Camera Capture',
  image_transmission: 'Image Transmission',
  gemini_analysis: 'Gemini Analysis',
};

export const MedicineResults: React.FC<MedicineResultsProps> = ({
  medicine,
  langName,
  statusMessage,
  errorStage,
  debugInfo,
  needsRefreshForSettings,
  canRetryScan,
  onRefreshScan,
  isScanning,
}) => {
  const bannerStyles = {
    info: 'bg-white border-slate-200 text-slate-700',
    loading: 'bg-teal-50 border-teal-200 text-teal-900',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-950',
    danger: 'bg-rose-50 border-rose-200 text-rose-950',
  }[statusMessage.type];

  const BannerIcon =
    statusMessage.type === 'danger'
      ? ShieldAlert
      : statusMessage.type === 'warning'
        ? AlertTriangle
        : statusMessage.type === 'success'
          ? CheckCircle2
          : Stethoscope;

  const storeLinks = medicine ? buildPharmacyAppLinks(medicine.medicineName) : [];

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      <div
        role="status"
        aria-live="polite"
        className={`rounded-2xl border p-4 flex items-start justify-between gap-3 ${bannerStyles}`}
      >
        <div className="flex items-start gap-3">
          <BannerIcon className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="text-sm font-medium leading-relaxed">
            {errorStage && (statusMessage.type === 'danger' || statusMessage.type === 'warning') && (
              <span className="block text-xs font-bold uppercase tracking-wider opacity-80 mb-0.5">
                {STAGE_LABELS[errorStage]}
              </span>
            )}
            <p>{statusMessage.text}</p>
          </div>
        </div>

        {(needsRefreshForSettings || canRetryScan) && (
          <button
            type="button"
            onClick={onRefreshScan}
            disabled={isScanning}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
              canRetryScan
                ? 'bg-rose-700 hover:bg-rose-800'
                : 'bg-teal-700 hover:bg-teal-800'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            {canRetryScan ? 'Retry Scan' : `Update (${langName})`}
          </button>
        )}
      </div>

      {!medicine && statusMessage.type === 'info' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-600">
          <h2 className="text-base font-bold text-slate-900 mb-1.5">
            Ready to verify your medicine
          </h2>
          <p className="text-sm leading-relaxed">
            Point your camera at a medicine strip or bottle, upload a photo, or click one of the
            sample buttons to test clear text extraction and blurry-label safety refusal.
          </p>
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
            <div>
              <p className="font-semibold text-slate-900">1. Text-only safety gate</p>
              <p className="mt-0.5">Unreadable labels are rejected instead of guessed by color.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">2. Verified pack fields</p>
              <p className="mt-0.5">Visible name, active ingredients, and strength shown separately.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">3. Live nearby stores</p>
              <p className="mt-0.5">Open vs. closed pharmacies via Google Maps grounding.</p>
            </div>
          </div>
        </div>
      )}

      {medicine && (
        <>
          {/* Verified Packaging Information Card */}
          <section id="medicine-details" className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                  Visible Medicine Name
                </p>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">
                  {medicine.medicineName}
                </h2>
              </div>
              <span className="text-xs font-mono tabular-nums font-semibold text-teal-800">
                EXP: {medicine.expiryText}
              </span>
            </div>

            {/* Separated Active Ingredients & Strength */}
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <dt className="text-xs font-semibold text-slate-500">Active Ingredients</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  {medicine.activeIngredients}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <dt className="text-xs font-semibold text-slate-500">Strength</dt>
                <dd className="mt-1 text-sm font-semibold font-mono text-slate-900">
                  {medicine.strength}
                </dd>
              </div>
            </dl>

            {medicine.visibleTexts && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                <p>
                  <span className="font-semibold text-slate-900">Exact printed text read: </span>
                  <span className="font-mono">{medicine.visibleTexts}</span>
                </p>
              </div>
            )}

            <div className="mt-3 space-y-2">
              <p className="text-sm text-slate-800 leading-relaxed">{medicine.overview}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{medicine.expiryGuidance}</p>
            </div>

            <div className="mt-4 rounded-xl bg-amber-50 p-3.5 text-sm text-amber-950 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" aria-hidden="true" />
              <div className="space-y-1 leading-relaxed">
                <p>{medicine.warnings}</p>
                <p className="text-xs font-semibold text-amber-900">
                  Informational only: consult a qualified doctor or licensed pharmacist for dosing
                  and medication decisions.
                </p>
              </div>
            </div>

            {medicine.sources.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  Medical References (Google Search)
                </p>
                <ul className="space-y-1.5">
                  {medicine.sources.slice(0, 4).map((source) => (
                    <li key={source.uri}>
                      <a
                        href={source.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline break-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{source.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Pharmacy Apps Direct Search */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="text-base font-bold text-slate-900">Pharmacy Apps (Direct Search)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Open online pharmacies pre-filled with {medicine.medicineName}
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {storeLinks.map((store) => (
                <a
                  key={store.name}
                  href={store.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-50/70 hover:bg-teal-100/80 border border-teal-200/70 text-teal-900 text-sm font-semibold flex items-center justify-between gap-2 transition-colors"
                >
                  <span>{store.name}</span>
                  <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Collapsible Scan Diagnostics */}
      {debugInfo && (
        <details className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700 inline-flex items-center gap-1.5 select-none">
            <Bug className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Scan Diagnostics</span>
          </summary>
          <dl className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
            <div>
              <dt className="text-slate-400">Source</dt>
              <dd className="text-slate-800">{debugInfo.source}</dd>
            </div>
            <div>
              <dt className="text-slate-400">MIME Type</dt>
              <dd className="text-slate-800">{debugInfo.mimeType}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Dimensions</dt>
              <dd className="text-slate-800">
                {debugInfo.width}×{debugInfo.height}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Base64 Chars</dt>
              <dd className="text-slate-800">{debugInfo.base64Length.toLocaleString()}</dd>
            </div>
            {typeof debugInfo.decodedBytes === 'number' && (
              <div>
                <dt className="text-slate-400">Server Bytes</dt>
                <dd className="text-slate-800">{debugInfo.decodedBytes.toLocaleString()}</dd>
              </div>
            )}
            {debugInfo.stage && (
              <div>
                <dt className="text-slate-400">Stage</dt>
                <dd className="text-slate-800">{debugInfo.stage}</dd>
              </div>
            )}
            {debugInfo.modelUsed && (
              <div className="col-span-2">
                <dt className="text-slate-400">Model</dt>
                <dd className="text-slate-800">{debugInfo.modelUsed}</dd>
              </div>
            )}
            {typeof debugInfo.visionDurationMs === 'number' && (
              <div>
                <dt className="text-slate-400">OCR Time</dt>
                <dd className="text-slate-800">{debugInfo.visionDurationMs} ms</dd>
              </div>
            )}
            {typeof debugInfo.searchDurationMs === 'number' && (
              <div>
                <dt className="text-slate-400">Lookup Time</dt>
                <dd className="text-slate-800">
                  {debugInfo.searchDurationMs} ms (
                  {debugInfo.searchGrounded ? 'Search Grounded' : 'Standard'})
                </dd>
              </div>
            )}
            {debugInfo.detail && (
              <div className="col-span-full">
                <dt className="text-slate-400">Detail</dt>
                <dd className="text-slate-800 break-words">{debugInfo.detail}</dd>
              </div>
            )}
          </dl>
        </details>
      )}
    </div>
  );
};
