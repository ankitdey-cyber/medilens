import { LanguageOption } from '../types/medilens';

export const LANGUAGES: LanguageOption[] = [
  { code: 'en-IN', name: 'English', native: 'English' },
  { code: 'hi-IN', name: 'Hindi', native: 'हिंदी' },
  { code: 'bn-IN', name: 'Bengali', native: 'বাংলা' },
  { code: 'gu-IN', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'pa-IN', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'mr-IN', name: 'Marathi', native: 'मराठी' },
  { code: 'ta-IN', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te-IN', name: 'Telugu', native: 'తెలుగు' },
  { code: 'ml-IN', name: 'Malayalam', native: 'മലയാളം' },
];

export function buildPharmacyAppLinks(medicineName: string) {
  const q = encodeURIComponent(medicineName);
  return [
    { name: 'Tata 1mg', url: `https://www.1mg.com/search/all?name=${q}` },
    { name: 'PharmEasy', url: `https://pharmeasy.in/search/all?name=${q}` },
    { name: 'Apollo Pharmacy', url: `https://www.apollopharmacy.in/search-medicines/${q}` },
    { name: 'Netmeds', url: `https://www.netmeds.com/catalogsearch/result?q=${q}` },
  ];
}
