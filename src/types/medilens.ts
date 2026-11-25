export interface LanguageOption {
  code: string;
  name: string;
  native: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export type ScanStage = 'camera_capture' | 'image_transmission' | 'gemini_analysis';

export interface ScanDebugInfo {
  source: 'camera' | 'upload' | 'sample';
  mimeType: string;
  width: number;
  height: number;
  base64Length: number;
  decodedBytes?: number;
  modelUsed?: string;
  visionDurationMs?: number;
  searchDurationMs?: number;
  searchGrounded?: boolean;
  stage?: ScanStage;
  detail?: string;
}

export interface MedicineDetails {
  medicineName: string;
  activeIngredients: string;
  strength: string;
  expiryText: string;
  visibleTexts: string;
  overview: string;
  warnings: string;
  expiryGuidance: string;
  sources: GroundingSource[];
}

export interface PharmacyPlace {
  title: string;
  uri: string;
  openNow: boolean | null;
  snippet?: string;
}

export interface PharmacySearchResponse {
  summaryText: string;
  places: PharmacyPlace[];
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  sources?: GroundingSource[];
}

export interface CapturedImage {
  mimeType: string;
  base64: string;
  previewUrl: string;
  label: string;
  source: 'camera' | 'upload' | 'sample';
  width: number;
  height: number;
  byteSize: number;
}
