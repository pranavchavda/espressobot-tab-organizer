import React, { useState } from 'react';
import { Save, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Settings as SettingsType, DEFAULT_MODEL } from '../types';

interface SettingsProps {
  settings: SettingsType;
  onSave: (settings: SettingsType) => void;
  onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ settings, onSave, onBack }) => {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [showKey, setShowKey] = useState(false);

  const handleSave = () => {
    onSave({ apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODEL });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-slate-800/30 border-b border-slate-700 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            OpenRouter API Key <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 pr-10"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Get a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" className="text-blue-400 hover:underline">openrouter.ai/keys</a>
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Model
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODEL}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Any <a href="https://openrouter.ai/models" target="_blank" rel="noopener" className="text-blue-400 hover:underline">OpenRouter model</a>. Default: {DEFAULT_MODEL}
          </p>
        </div>
      </div>

      <div className="p-4 border-t border-slate-700 bg-slate-800">
        <button
          onClick={handleSave}
          disabled={!apiKey.trim()}
          className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} />
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default Settings;
