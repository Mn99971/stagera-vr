import { useRef, useState, type DragEvent } from 'react'
import {
  ALLOWED_MATERIAL_EXTENSIONS,
  formatFileSize,
  validateMaterialFile,
} from '../ai/topicExtractor'
import { translations } from '../lib/i18n'
import type { AppLanguage, UploadedMaterialFile } from '../types/stagera'

interface MaterialUploadScreenProps {
  language: AppLanguage
  files: UploadedMaterialFile[]
  outlineText: string
  isExtracting: boolean
  onFilesChange: (files: UploadedMaterialFile[]) => void
  onOutlineChange: (text: string) => void
  onContinue: () => void
  onSkip: () => void
}

export function MaterialUploadScreen({
  language,
  files,
  outlineText,
  isExtracting,
  onFilesChange,
  onOutlineChange,
  onContinue,
  onSkip,
}: MaterialUploadScreenProps) {
  const t = translations[language].wizard
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleIncomingFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setErrorMsg(null)

    const accepted: UploadedMaterialFile[] = []
    for (const file of Array.from(fileList)) {
      const check = validateMaterialFile(file, ALLOWED_MATERIAL_EXTENSIONS)
      if (!check.valid) {
        setErrorMsg(check.reason === 'size' ? t.material.errFileSize : t.material.errFileType)
        continue
      }

      let extractedText: string | undefined
      if (check.extension === 'txt') {
        try {
          extractedText = await file.text()
        } catch {
          extractedText = undefined
        }
      }

      accepted.push({
        id: `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        sizeBytes: file.size,
        extension: check.extension,
        extractedText,
      })
    }

    if (accepted.length > 0) {
      onFilesChange([...files, ...accepted])
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    void handleIncomingFiles(e.dataTransfer.files)
  }

  const handleRemoveFile = (id: string) => {
    onFilesChange(files.filter((f) => f.id !== id))
  }

  const hasMaterial = files.length > 0 || outlineText.trim().length > 0

  return (
    <div className="wizard-body">
      <h1 className="screen-title">{t.material.heading}</h1>
      <p className="screen-subtitle">{t.material.subtitle}</p>

      <div
        id="material-dropzone"
        role="button"
        tabIndex={0}
        aria-label={t.material.dropzoneTitle}
        className={`upload-dropzone ${dragActive ? 'drag-active' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          id="material-file-input"
          type="file"
          multiple
          accept=".pptx,.pdf,.docx,.txt"
          className="sr-only"
          onChange={(e) => {
            void handleIncomingFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <span className="upload-dropzone-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 16V4" />
            <path d="M7 9l5-5 5 5" />
            <path d="M4 20h16" />
          </svg>
        </span>
        <span className="upload-dropzone-title">{t.material.dropzoneTitle}</span>
        <span className="upload-dropzone-sub">{t.material.dropzoneSubtitle}</span>
        <span className="upload-dropzone-limit">{t.material.dropzoneLimit}</span>
      </div>

      {errorMsg && (
        <div className="error-alert" role="alert" style={{ marginTop: 12 }}>
          {errorMsg}
        </div>
      )}

      {files.length > 0 && (
        <div className="uploaded-file-section">
          <p className="section-label">{t.material.uploadedFilesLabel}</p>
          <ul className="uploaded-file-list">
            {files.map((file) => (
              <li key={file.id} className="uploaded-file-row">
                <div className="uploaded-file-info">
                  <span className="file-ext-badge">{file.extension.toUpperCase()}</span>
                  <div className="uploaded-file-text">
                    <span className="uploaded-file-name">{file.name}</span>
                    <span className="uploaded-file-size">{formatFileSize(file.sizeBytes)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-remove-inline"
                  aria-label={`${t.material.removeFile} ${file.name}`}
                  onClick={() => handleRemoveFile(file.id)}
                >
                  {t.material.removeFile}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="field-group" style={{ marginTop: 18 }}>
        <label htmlFor="material-outline-textarea" className="field-label">
          <span>{t.material.outlineLabel}</span>
          <span className="field-optional">{t.material.outlineOptional}</span>
        </label>
        <textarea
          id="material-outline-textarea"
          className="text-input text-area"
          rows={5}
          value={outlineText}
          placeholder={t.material.outlinePlaceholder}
          onChange={(e) => onOutlineChange(e.target.value)}
        />
      </div>

      <div className="wizard-footer-actions">
        <button
          id="wizard-material-continue"
          type="button"
          className="btn-primary"
          disabled={isExtracting || !hasMaterial}
          onClick={onContinue}
        >
          {isExtracting ? t.extracting : t.continue}
        </button>
        <button
          id="wizard-material-skip"
          type="button"
          className="btn-secondary"
          disabled={isExtracting}
          onClick={onSkip}
        >
          {t.material.skipNoSlides}
        </button>
      </div>
    </div>
  )
}
