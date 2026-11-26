import type { LucideIcon } from 'lucide-react';
import {
  Camera,
  Languages,
  Mail,
  MapPin,
  MessageCircle,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Store,
} from 'lucide-react';

interface Step {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: Camera,
    title: 'Scan the label',
    description:
      'Point your camera at a medicine strip or bottle, upload a photo, or try one of the sample labels.',
  },
  {
    icon: Sparkles,
    title: 'Understand it',
    description:
      'Gemini reads the printed text and explains the medicine, strength, uses and precautions in your language.',
  },
  {
    icon: MapPin,
    title: 'Find and ask',
    description:
      'See pharmacies near you that may stock it, and ask the pharmacist assistant any follow-up questions.',
  },
];

const FEATURES: Feature[] = [
  {
    icon: ScanLine,
    title: 'Label scanning',
    description: 'Reads medicine names, active ingredients and imprints from real-world photos.',
  },
  {
    icon: Languages,
    title: 'Multilingual voice',
    description: 'Results in Indian and global languages, read aloud with text-to-speech.',
  },
  {
    icon: Store,
    title: 'Nearby pharmacies',
    description: 'Uses your GPS location to list pharmacies around you.',
  },
  {
    icon: MessageCircle,
    title: 'Pharmacist chat',
    description: 'Ask questions about the scanned medicine by typing or speaking.',
  },
];

const TECH_STACK: string[] = [
  'React',
  'TypeScript',
  'Vite',
  'Tailwind CSS',
  'Express',
  'Gemini API',
  'Lucide Icons',
];

const DEVELOPER = {
  name: 'Ranbir Singh',
  role: 'Developer, MediLens',
  photo: '/assets/developer.png',
  email: 'ssinghranbir08@gmail.com',
};

export function About() {
  return (
    <section
      id="about"
      aria-labelledby="about-heading"
      className="scroll-mt-20 bg-white border-t border-slate-200"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-12">
        {/* Intro */}
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
            About MediLens
          </p>
          <h2
            id="about-heading"
            className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
          >
            Know what you're taking, in the language you speak.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
            MediLens turns a photo of a medicine label into clear, plain-language information,
            helps you find it nearby, and answers your questions about it.
          </p>
        </header>

        {/* How it works */}
        <div>
          <h3 className="text-base font-bold text-slate-900">How it works</h3>
          <ol className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {STEPS.map(({ icon: Icon, title, description }, index) => (
              <li
                key={title}
                className="bg-[#f4f7f6] border border-slate-200 rounded-2xl p-5 flex flex-col gap-3"
              >
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-teal-700 text-white inline-flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-mono font-semibold text-teal-700">
                    Step {index + 1}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">{title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Features */}
        <div>
          <h3 className="text-base font-bold text-slate-900">Features</h3>
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li
                key={title}
                className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-2"
              >
                <span className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 inline-flex items-center justify-center">
                  <Icon className="w-4.5 h-4.5" aria-hidden="true" />
                </span>
                <h4 className="text-sm font-bold text-slate-900">{title}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Tech stack + developer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#f4f7f6] border border-slate-200 rounded-2xl p-5">
            <h3 className="text-base font-bold text-slate-900">Built with</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {TECH_STACK.map((tech) => (
                <li
                  key={tech}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  {tech}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
              <p>
                MediLens is for general information only and is not medical advice. Always
                check with a doctor or pharmacist before taking any medicine.
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center sm:items-center gap-5">
            <img
              src={DEVELOPER.photo}
              alt={`Photo of ${DEVELOPER.name}`}
              width={112}
              height={112}
              loading="lazy"
              className="w-28 h-28 rounded-2xl object-cover object-[45%_30%] border border-slate-200 shrink-0"
            />
            <div className="text-center sm:text-left lg:text-center xl:text-left min-w-0">
              <h3 className="text-base font-bold text-slate-900">{DEVELOPER.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{DEVELOPER.role}</p>
              <a
                href={`mailto:${DEVELOPER.email}`}
                className="mt-3 min-h-[40px] px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
              >
                <Mail className="w-4 h-4" aria-hidden="true" />
                <span>Email me</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
