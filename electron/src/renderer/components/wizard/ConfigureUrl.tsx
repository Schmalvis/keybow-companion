import React, { useState, useEffect } from 'react';

interface UrlEntry {
  name: string;
  url: string;
}

interface ConfigureUrlProps {
  value: string;
  onChange: (url: string) => void;
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ConfigureUrl({ value, onChange }: ConfigureUrlProps) {
  const [categories, setCategories] = useState<Record<string, UrlEntry[]>>({});
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [customUrl, setCustomUrl] = useState(value || '');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    window.keybow.getSuggestions().then((data) => {
      const urls = data.urls ?? {};
      setCategories(urls);
      const firstCategory = Object.keys(urls)[0] ?? '';
      setActiveCategory(firstCategory);
    });
  }, []);

  useEffect(() => {
    setCustomUrl(value || '');
  }, [value]);

  const handleSelectUrl = (url: string) => {
    setCustomUrl(url);
    onChange(url);
  };

  const handleCustomChange = (text: string) => {
    setCustomUrl(text);
    setTouched(true);
    if (isValidUrl(text)) {
      onChange(text);
    }
  };

  const categoryNames = Object.keys(categories);
  const urlsInCategory = categories[activeCategory] ?? [];
  const showError = touched && customUrl.length > 0 && !isValidUrl(customUrl);

  return (
    <div className="target-section">
      {value && (
        <p style={{ color: '#7c6ef0', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Selected: <strong>{value}</strong>
        </p>
      )}

      <h4>Popular Sites</h4>
      <div className="url-categories">
        {categoryNames.map((cat) => (
          <button
            key={cat}
            className={`url-category-tab ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="url-list">
        {urlsInCategory.map((entry) => (
          <div key={entry.url} className="url-item" onClick={() => handleSelectUrl(entry.url)}>
            <div>{entry.name}</div>
            <div className="url-item-url">{entry.url}</div>
          </div>
        ))}
      </div>

      <h4>Custom URL</h4>
      <input
        className={`custom-url-input ${showError ? 'invalid' : ''}`}
        type="text"
        placeholder="https://..."
        value={customUrl}
        onChange={(e) => handleCustomChange(e.target.value)}
      />
      {showError && <div className="url-error">Enter a valid URL (https://...)</div>}
    </div>
  );
}
