import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, Volume2, VolumeX } from 'lucide-react';
import { About } from './components/About';
import { CameraScanner } from './components/CameraScanner';
import { MedicineResults } from './components/MedicineResults';
import { NearbyPharmacies } from './components/NearbyPharmacies';
import { PharmacistChat } from './components/PharmacistChat';
import { LANGUAGES } from './constants/languages';
import { ApiRequestError, postJson } from './utils/api';
import {
  CapturedImage,
  ChatMessage,
  LanguageOption,
  MedicineDetails,
  PharmacySearchResponse,
  ScanDebugInfo,
  ScanStage,
} from './types/medilens';

interface StatusState {
  type: 'info' | 'loading' | 'success' | 'warning' | 'danger';
  text: string;
}

export default function App() {
  const [selectedLang, setSelectedLang] = useState<LanguageOption>(LANGUAGES[0]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [isImageProcessed, setIsImageProcessed] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [medicine, setMedicine] = useState<MedicineDetails | null>(null);
  const [scannedSignature, setScannedSignature] = useState<string | null>(null);
  const [errorStage, setErrorStage] = useState<ScanStage | null>(null);
  const [debugInfo, setDebugInfo] = useState<ScanDebugInfo | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusState>({
    type: 'info',
    text: 'Align a medicine strip or bottle in the viewfinder and tap Scan Medicine, upload a photo, or run a test sample.',
  });

  const [coords, setCoords] = useState({ lat: 22.5726, lng: 88.3639 });
  const [hasGpsLock, setHasGpsLock] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [pharmacies, setPharmacies] = useState<PharmacySearchResponse | null>(null);
  const [isLoadingPharmacies, setIsLoadingPharmacies] = useState(false);
  const [pharmacyError, setPharmacyError] = useState<string | null>(null);

  const isSecureContext = typeof window === 'undefined' ? true : window.isSecureContext;

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatSending, setIsChatSending] = useState(false);

  const speakText = useCallback(
    (text: string, langCode: string) => {
      if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = langCode;
        const voices = window.speechSynthesis.getVoices();
        const prefix = langCode.split('-')[0].toLowerCase();
        const matched =
          voices.find((v) => v.lang.toLowerCase().startsWith(langCode.toLowerCase())) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
        if (matched) {
          utter.voice = matched;
        }
        window.speechSynthesis.speak(utter);
      } catch {
        // Ignore speech synthesis errors on restricted browsers
      }
    },
    [voiceEnabled]
  );

  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const requestLocation = useCallback((): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setHasGpsLock(false);
        setLocationNotice(
          'Open on localhost or https to use GPS location. Using default city coordinates for nearby pharmacies.'
        );
        resolve(coordsRef.current);
        return;
      }
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setHasGpsLock(false);
        setLocationNotice(
          'Geolocation is not supported in this browser. Using default city coordinates for nearby pharmacies.'
        );
        resolve(coordsRef.current);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(next);
          setHasGpsLock(true);
          setLocationNotice(null);
          resolve(next);
        },
        (geoErr) => {
          setHasGpsLock(false);
          if (geoErr.code === geoErr.PERMISSION_DENIED) {
            setLocationNotice(
              'Location permission was denied. Showing pharmacies near default city coordinates — allow location access in your browser settings and tap Refresh GPS to use your current location.'
            );
          } else if (geoErr.code === geoErr.POSITION_UNAVAILABLE) {
            setLocationNotice(
              'Your device location is currently unavailable. Showing pharmacies near default city coordinates.'
            );
          } else if (geoErr.code === geoErr.TIMEOUT) {
            setLocationNotice(
              'Location request timed out. Showing pharmacies near default city coordinates — tap Refresh GPS to retry.'
            );
          } else {
            setLocationNotice(
              'Could not read your GPS location. Showing pharmacies near default city coordinates.'
            );
          }
          resolve(coordsRef.current);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    });
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const fetchNearbyPharmacies = useCallback(
    async (medicineName: string, activeCoords?: { lat: number; lng: number }) => {
      const targetCoords = activeCoords ?? coordsRef.current;
      setIsLoadingPharmacies(true);
      setPharmacyError(null);
      try {
        const data = await postJson<PharmacySearchResponse>('/api/medilens/pharmacies', {
          medicineName,
          latitude: targetCoords.lat,
          longitude: targetCoords.lng,
          langName: selectedLang.name,
        });
        setPharmacies(data);
      } catch (err) {
        setPharmacyError(
          err instanceof Error ? err.message : 'Unable to fetch nearby pharmacies right now.'
        );
      } finally {
        setIsLoadingPharmacies(false);
      }
    },
    [selectedLang.name]
  );

  const handleRunScan = async (image: CapturedImage) => {
    setIsScanning(true);
    setErrorStage(null);

    const clientDebug: ScanDebugInfo = {
      source: image.source,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      base64Length: image.base64.length,
    };
    setDebugInfo(clientDebug);

    setStatusMessage({
      type: 'loading',
      text: `Reading printed label text and verifying details in ${selectedLang.name}...`,
    });

    try {
      const data = await postJson<{
        legible: boolean;
        medicineName?: string;
        reason?: string;
        medicine?: MedicineDetails;
        debug?: Partial<ScanDebugInfo>;
      }>('/api/medilens/scan', {
        imageBase64: image.base64,
        mimeType: image.mimeType,
        langName: selectedLang.name,
        langCode: selectedLang.code,
      });

      const mergedDebug: ScanDebugInfo = {
        ...clientDebug,
        ...data.debug,
      };
      setDebugInfo(mergedDebug);

      if (!data.legible || !data.medicine) {
        setMedicine(null);
        setPharmacies(null);
        setChatMessages([]);
        setScannedSignature(null);
        setIsImageProcessed(true);
        setErrorStage('gemini_analysis');
        const labelTitle = data.medicineName || 'Unable to identify medicine';
        const reason =
          data.reason ||
          'No clearly readable medicine name, active ingredient, or pill imprint was found.';
        setStatusMessage({
          type: 'danger',
          text: `${labelTitle}: ${reason}`,
        });
        speakText(`${labelTitle}. ${reason}`, selectedLang.code);
        return;
      }

      const scannedMed = data.medicine;
      setMedicine(scannedMed);
      setIsImageProcessed(true);
      setChatMessages([]);
      setScannedSignature(selectedLang.code);
      setStatusMessage({
        type: 'success',
        text: `Identified ${scannedMed.medicineName} (${scannedMed.activeIngredients} · ${scannedMed.strength}) in ${selectedLang.name}.`,
      });

      speakText(
        `${scannedMed.medicineName}. ${scannedMed.activeIngredients}, ${scannedMed.strength}. ${scannedMed.overview}`,
        selectedLang.code
      );

      fetchNearbyPharmacies(scannedMed.medicineName);
    } catch (err) {
      const stage: ScanStage =
        err instanceof ApiRequestError ? err.stage : 'image_transmission';
      setErrorStage(stage);
      setDebugInfo((prev) => ({
        ...(prev || clientDebug),
        ...(err instanceof ApiRequestError && err.debug ? err.debug : {}),
        stage,
        detail:
          (err instanceof ApiRequestError && err.debug?.detail) ||
          (err instanceof Error ? err.message : 'Scan failed'),
      }));
      setStatusMessage({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Unable to scan medicine image.',
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleToggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (!next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const handleLanguageSelect = (lang: LanguageOption) => {
    setSelectedLang(lang);
    setErrorStage(null);
    if (medicine) {
      setStatusMessage({
        type: 'info',
        text: `Language switched to ${lang.name}. Select Update to refresh results in ${lang.name}.`,
      });
    }
  };

  const handleSendChatQuestion = async (question: string) => {
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: question,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsChatSending(true);

    try {
      const data = await postJson<{
        reply: string;
        sources?: ChatMessage['sources'];
      }>('/api/medilens/chat', {
        question,
        medicineContext: medicine,
        langName: selectedLang.name,
      });

      const botMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        sender: 'assistant',
        text: data.reply,
        sources: data.sources || [],
      };
      setChatMessages((prev) => [...prev, botMsg]);
      speakText(data.reply, selectedLang.code);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Request failed.';
      setChatMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, sender: 'assistant', text: `Error: ${errMsg}` },
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  const handleRefreshPharmacies = async () => {
    const freshCoords = await requestLocation();
    fetchNearbyPharmacies(medicine?.medicineName || 'medicine', freshCoords);
  };

  const currentSignature = selectedLang.code;
  const needsRefreshForSettings =
    Boolean(medicine) && Boolean(capturedImage) && scannedSignature !== currentSignature;

  return (
    <div className="min-h-screen bg-[#f4f7f6] text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="#scanner"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            MediLens
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#scanner"
              className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Scanner
            </a>
            <a
              href="#medicine-details"
              className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Details
            </a>
            <a
              href="#pharmacies"
              className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Pharmacies
            </a>
            <a
              href="#pharmacist"
              className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Pharmacist
            </a>
            <a
              href="#about"
              className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              About
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="#about"
              className="md:hidden min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center"
            >
              About
            </a>
            <button
              type="button"
              onClick={handleToggleVoice}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                voiceEnabled
                  ? 'bg-teal-700 text-white hover:bg-teal-800'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {voiceEnabled ? (
                <Volume2 className="w-4 h-4" aria-hidden="true" />
              ) : (
                <VolumeX className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{voiceEnabled ? 'Voice: ON' : 'Voice: OFF'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Multilingual Selector Strip */}
      <div className="bg-white border-b border-slate-200">
        <div
          role="tablist"
          aria-label="Response language"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar"
        >
          {LANGUAGES.map((lang) => {
            const active = lang.code === selectedLang.code;
            return (
              <button
                key={lang.code}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleLanguageSelect(lang)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {lang.native} ({lang.name})
              </button>
            );
          })}
        </div>
      </div>

      {/* Insecure Context Banner */}
      {!isSecureContext && (
        <div
          role="alert"
          className="bg-amber-50 border-b border-amber-200 text-amber-950"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-2.5 text-xs sm:text-sm font-medium">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            <span>
              Open on localhost or https to use the camera, microphone, and GPS location. You can
              still upload a photo instead or test with the sample labels below.
            </span>
          </div>
        </div>
      )}

      {/* Main Responsive Workbench */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 lg:sticky lg:top-20">
          <CameraScanner
            capturedImage={capturedImage}
            onImageSelected={(img) => {
              setCapturedImage(img);
              setIsImageProcessed(false);
              if (!img) {
                setErrorStage(null);
              }
            }}
            onRunScan={handleRunScan}
            isScanning={isScanning}
            isImageProcessed={isImageProcessed}
            onError={(msg, stage) => {
              setErrorStage(stage);
              setDebugInfo((prev) => ({
                source: prev?.source ?? 'camera',
                mimeType: prev?.mimeType ?? 'unknown',
                width: prev?.width ?? 0,
                height: prev?.height ?? 0,
                base64Length: prev?.base64Length ?? 0,
                stage,
                detail: msg,
              }));
              setStatusMessage({ type: 'warning', text: msg });
            }}
          />
        </div>

        <div className="lg:col-span-7 space-y-4">
          <MedicineResults
            medicine={medicine}
            langName={selectedLang.name}
            statusMessage={statusMessage}
            errorStage={errorStage}
            debugInfo={debugInfo}
            needsRefreshForSettings={needsRefreshForSettings}
            canRetryScan={
              Boolean(capturedImage) &&
              statusMessage.type === 'danger' &&
              errorStage === 'gemini_analysis' &&
              !isImageProcessed
            }
            onRefreshScan={() => capturedImage && handleRunScan(capturedImage)}
            isScanning={isScanning}
          />

          <NearbyPharmacies
            data={pharmacies}
            isLoading={isLoadingPharmacies}
            error={pharmacyError}
            coords={coords}
            hasGpsLock={hasGpsLock}
            locationNotice={locationNotice}
            onRefresh={handleRefreshPharmacies}
          />

          <PharmacistChat
            messages={chatMessages}
            isSending={isChatSending}
            langCode={selectedLang.code}
            langName={selectedLang.name}
            onSendQuestion={handleSendChatQuestion}
            onUnsupportedVoice={(msg) => {
              setErrorStage(null);
              setStatusMessage({ type: 'warning', text: msg });
            }}
          />
        </div>
      </main>

      <About />
    </div>
  );
}
