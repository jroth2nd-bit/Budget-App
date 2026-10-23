import React, { useState } from 'react';

interface LowBalanceThresholdInputProps {
  threshold: number;
  setThreshold: (value: number) => void;
}

interface LowBalanceThresholdInputProps {
  threshold: number;
  setThreshold: (value: number) => void;
  inputClassName?: string;
}

export default function LowBalanceThresholdInput({ threshold, setThreshold, inputClassName }: LowBalanceThresholdInputProps) {
  return (
    <div style={{ marginBottom: 0 }}>
      <label style={{ fontWeight: 500, marginRight: 8 }}>
        Threshold ($):
      </label>
      <input
        type="number"
        step="0.01"
        value={threshold}
        onChange={e => setThreshold(Number(e.target.value))}
        className={inputClassName || ''}
        style={{ width: 110, marginLeft: 8, textAlign: 'center' }}
      />
    </div>
  );
}
