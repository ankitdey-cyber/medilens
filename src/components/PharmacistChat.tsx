import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Mic, MicOff, Send } from 'lucide-react';
import { ChatMessage } from '../types/medilens';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

interface PharmacistChatProps {
  messages: ChatMessage[];
  isSending: boolean;
  langCode: string;
  langName: string;
  onSendQuestion: (question: string) => void;
  onUnsupportedVoice: (message: string) => void;
}

export const PharmacistChat: React.FC<PharmacistChatProps> = ({
  messages,
  isSending,
  langCode,
  langName,
  onSendQuestion,
  onUnsupportedVoice,
}) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setInput('');
    onSendQuestion(trimmed);
  };

  const reportMicError = (msg: string) => {
    setMicNotice(msg);
    onUnsupportedVoice(msg);
  };

  const toggleMic = () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reportMicError(
        'Open on localhost or https to use the microphone. You can still type your question below.'
      );
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      reportMicError('Voice input is unavailable in this browser. Type your question below.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    setMicNotice(null);
    const rec = new SpeechRec();
    rec.lang = langCode;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setMicNotice(null);
        setInput(transcript);
        onSendQuestion(transcript);
      }
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = (event) => {
      setIsListening(false);
      const code = event?.error || '';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        reportMicError(
          'Microphone permission was denied. Allow microphone access in your browser settings, or type your question below.'
        );
      } else if (code === 'audio-capture') {
        reportMicError(
          'No microphone was detected on this device. You can type your question below.'
        );
      } else if (code === 'no-speech') {
        setMicNotice('No speech was detected. Tap Mic to try again or type your question below.');
      } else if (code && code !== 'aborted') {
        reportMicError(
          `Microphone input stopped (${code}). You can type your question below.`
        );
      }
    };

    recognitionRef.current = rec;
    try {
      setIsListening(true);
      rec.start();
    } catch {
      setIsListening(false);
      reportMicError(
        'Unable to start microphone input. Check browser microphone permissions or type your question below.'
      );
    }
  };

  return (
    <section id="pharmacist" className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-baseline justify-between gap-2 pb-3 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-900">Voice &amp; Text Pharmacist Chat</h2>
        <span className="text-xs text-slate-500">Responding in {langName}</span>
      </div>

      <div className="mt-3 max-h-64 overflow-y-auto space-y-2.5 pr-1">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">
            Ask a follow-up question about active ingredients, food interactions, side effects,
            storage, or nearby stores.
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                  msg.sender === 'user'
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-50 text-slate-800'
                }`}
              >
                {msg.text}
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {msg.sources.slice(0, 3).map((s) => (
                    <a
                      key={s.uri}
                      href={s.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span className="truncate max-w-[200px]">{s.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>

      {micNotice && (
        <div
          role="status"
          className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-950"
        >
          {micNotice}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about ingredients, food interactions, or side effects..."
          className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        />

        <button
          type="button"
          onClick={toggleMic}
          aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
          className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
            isListening
              ? 'bg-rose-600 text-white hover:bg-rose-700'
              : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
          }`}
        >
          {isListening ? (
            <>
              <MicOff className="w-4 h-4" aria-hidden="true" />
              Stop
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" aria-hidden="true" />
              Mic
            </>
          )}
        </button>

        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          <Send className="w-3.5 h-3.5" aria-hidden="true" />
          {isSending ? 'Asking...' : 'Ask'}
        </button>
      </form>
    </section>
  );
};
