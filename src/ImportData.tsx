import React, { useState } from 'react';
import * as XLSX from 'xlsx';

export default function ImportData({ addIncomes, addExpenses, tags = [], setTags }: { addIncomes: (newIncomes: any[], replaceAll?: boolean) => void; addExpenses: (newExpenses: any[], replaceAll?: boolean) => void; tags?: any[]; setTags?: (tags: any[]) => void }) {
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [replaceAll, setReplaceAll] = useState(false);
  const [importType, setImportType] = useState<'income' | 'expense'>('expense');
  const [previewMode, setPreviewMode] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappedName, setMappedName] = useState('');
  const [mappedAmount, setMappedAmount] = useState('');
  const [mappedFrequency, setMappedFrequency] = useState('');
  const [mappedStartDate, setMappedStartDate] = useState('');
  const [mappedCategory, setMappedCategory] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const fileContent = event.target?.result;
        let parsedData: Record<string, any>[] = [];
        if (uploadedFile.name.endsWith('.csv')) {
          parsedData = parseCSV(fileContent as string);
        } else if (uploadedFile.name.endsWith('.xlsx') || uploadedFile.name.endsWith('.xls')) {
          parsedData = parseExcel(fileContent as ArrayBuffer);
        }
        setData(parsedData);
        if (parsedData.length > 0) {
          const fileHeaders = Object.keys(parsedData[0]);
          setHeaders(fileHeaders);
          const lowerHeaders = fileHeaders.map(h => h.toLowerCase());
          setMappedName(fileHeaders[lowerHeaders.indexOf('name')] || '');
          setMappedAmount(fileHeaders[lowerHeaders.indexOf('amount')] || '');
          setMappedFrequency(fileHeaders[lowerHeaders.indexOf('frequency')] || '');
          setMappedStartDate(fileHeaders[lowerHeaders.indexOf('startdate')] || fileHeaders[lowerHeaders.indexOf('date')] || '');
          setMappedCategory(fileHeaders[lowerHeaders.indexOf('category')] || '');
          setPreviewMode(true);
        }
      } catch (err) {
        alert(`Error parsing file: ${err}`);
      }
    };
    if (uploadedFile.name.endsWith('.csv')) {
      reader.readAsText(uploadedFile);
    } else {
      reader.readAsArrayBuffer(uploadedFile);
    }
  };

  const parseCSV = (content: string): Record<string, any>[] => {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let insideQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        if (char === '"') {
          if (insideQuotes && nextChar === '"') {
            current += '"';
            i++;
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (char === ',' && !insideQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };
    const headers = parseCSVLine(lines[0]);
    const result: Record<string, any>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: Record<string, any> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      result.push(row);
    }
    return result;
  };

  const parseExcel = (arrayBuffer: ArrayBuffer): Record<string, any>[] => {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[];
    return data;
  };

  const handleImport = () => {
    try {
      const parseAmount = (str: string): number => {
        if (!str || typeof str !== 'string') return 0;
        const cleaned = str.replace(/[^\d.-]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) || num === 0 && cleaned.length === 0 ? 0 : num;
      };
      const filteredData = data.filter(row => {
        const name = row[mappedName]?.toString().trim() || '';
        const amountStr = row[mappedAmount]?.toString().trim() || '';
        const frequency = row[mappedFrequency]?.toString().trim() || '';
        const startDate = row[mappedStartDate]?.toString().trim() || '';
        if (!name && !amountStr && !frequency && !startDate) return false;
        const cleaned = amountStr.replace(/[\$,]/g, '');
        const num = parseFloat(cleaned);
        if (!cleaned || isNaN(num) || num === 0) return false;
        return true;
      });
      const newItems = filteredData.map((row, idx) => {
        const name = row[mappedName] || `Item ${idx}`;
        const amountStr = row[mappedAmount] || '';
        const amount = parseAmount(amountStr);
        const frequency = (row[mappedFrequency] || 'monthly');
        const startDateStr = row[mappedStartDate] || new Date().toISOString().split('T')[0];
        const startDate = new Date(startDateStr).toISOString().split('T')[0];
        const category = row[mappedCategory]?.toString().trim() || '';
        return {
          id: Date.now().toString() + idx,
          name,
          amount,
          frequency,
          startDate,
          isRecurring: false,
          tags: category ? [category] : [],
          icon: ''
        };
      });
      // Add new categories to tags if setTags is provided
      if (setTags && mappedCategory) {
        const uniqueCats = Array.from(new Set(newItems.flatMap(item => item.tags)));
        const existing = tags.map(t => t.name);
        const toAdd = uniqueCats.filter(cat => cat && !existing.includes(cat));
        if (toAdd.length > 0) {
          setTags([
            ...tags,
            ...toAdd.map(cat => ({ name: cat, icon: '', color: '#2a2f35' }))
          ]);
        }
      }
      if (importType === 'income') {
        addIncomes(newItems, replaceAll);
      } else {
        addExpenses(newItems, replaceAll);
      }
      alert(`Successfully imported ${newItems.length} ${importType} items. You may now refresh the page to see your data.`);
    } catch (err) {
      alert(`Error importing data: ${err}`);
    }
  };

  return (
    <div className="tagAdmin">
      {!previewMode ? (
        <form className="formSmall" onSubmit={e => e.preventDefault()} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <select value={importType} onChange={e => setImportType(e.target.value as any)}>
            <option value="income">Import Income</option>
            <option value="expense">Import Expense</option>
          </select>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} style={{ maxWidth: '100%' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={replaceAll} onChange={e => setReplaceAll(e.target.checked)} />
            <span>Replace All</span>
          </label>
          <small style={{ opacity: 0.7, flexBasis: '100%' }}>Supported: CSV, XLSX, XLS. Columns: name, amount, frequency, startDate</small>
        </form>
      ) : (
        <div>
          <div className="importPreview">
            <h4>Column Mapping</h4>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <label>
                Name:
                <select value={mappedName} onChange={e => setMappedName(e.target.value)}>
                  <option value="">-- None --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label>
                Amount:
                <select value={mappedAmount} onChange={e => setMappedAmount(e.target.value)}>
                  <option value="">-- None --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label>
                Frequency:
                <select value={mappedFrequency} onChange={e => setMappedFrequency(e.target.value)}>
                  <option value="">-- None --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label>
                Start Date:
                <select value={mappedStartDate} onChange={e => setMappedStartDate(e.target.value)}>
                  <option value="">-- None --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label>
                Category:
                <select value={mappedCategory} onChange={e => setMappedCategory(e.target.value)}>
                  <option value="">-- None --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            </div>
            <h4>Preview ({data.length} rows)</h4>
            <table className="importTable">
              <thead>
                <tr>
                  {headers.map(header => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 5).map((row, idx) => (
                  <tr key={idx}>
                    {headers.map(header => (
                      <td key={header}>{String(row[header] || '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length > 5 && <p style={{ opacity: 0.7 }}>... and {data.length - 5} more rows</p>}
          </div>
          <div className="formSmall" style={{ marginTop: '12px' }}>
            <button onClick={handleImport} style={{ width: '100%' }}>Import {data.length} Items</button>
            <button onClick={() => { setPreviewMode(false); setData([]); setHeaders([]); setMappedName(''); setMappedAmount(''); setMappedFrequency(''); setMappedStartDate('') }} style={{ width: '100%', background: '#666' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
