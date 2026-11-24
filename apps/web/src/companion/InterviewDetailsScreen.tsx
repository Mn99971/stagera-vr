import { useMemo, useRef, useState } from 'react'
import {
  ALLOWED_CV_EXTENSIONS,
  extractInterviewPreviewChips,
  formatFileSize,
  validateMaterialFile,
} from '../ai/topicExtractor'
import { translations } from '../lib/i18n'
import type { AppLanguage, InterviewDetails, UploadedMaterialFile } from '../types/stagera'

interface InterviewDetailsScreenProps {
  language: AppLanguage
  details: InterviewDetails
  isExtracting: boolean
  onChange: (next: InterviewDetails) => void
  onContinue: () => void
}

export function InterviewDetailsScreen({
  language,
  details,
  isExtracting,
  onChange,
  onContinue,
}: InterviewDetailsScreenProps) {
  const t = translations[language].wizard
  const cvInputRef = useRef<HTMLInputElement | null>(null)
  const [cvError, setCvError] = useState<string | null>(null)

  const previewChips = useMemo(
    () => extractInterviewPreviewChips(details, language),
    [details, language],
  )

  const handleCvSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setCvError(null)
    const file = fileList[0]
    const check = validateMaterialFile(file, ALLOWED_CV_EXTENSIONS)
    if (!check.valid) {
      setCvError(check.reason === 'size' ? t.interview.cvErrSize : t.interview.cvErrType)
      return
    }
    const cvFile: UploadedMaterialFile = {
      id: `cv-${Date.now().toString(36)}`,
      name: file.name,
      sizeBytes: file.size,
      extension: check.extension,
    }
    onChange({ ...details, cvFile })
  }

  return (
    <div className="wizard-body">
      <h1 className="screen-title">{t.interview.heading}</h1>
      <p className="screen-subtitle">{t.interview.subtitle}</p>

      <div className="form-stack">
        <div className="field-group">
          <label htmlFor="interview-job-title" className="field-label">
            {t.interview.jobTitleLabel}
          </label>
          <input
            id="interview-job-title"
            type="text"
            className="text-input"
            value={details.jobTitle}
            placeholder={t.interview.jobTitlePlaceholder}
            onChange={(e) => onChange({ ...details, jobTitle: e.target.value })}
          />
        </div>

        <div className="field-group">
          <label htmlFor="interview-jd" className="field-label">
            {t.interview.jdLabel}
          </label>
          <textarea
            id="interview-jd"
            className="text-input text-area"
            rows={4}
            value={details.jobDescription}
            placeholder={t.interview.jdPlaceholder}
            onChange={(e) => onChange({ ...details, jobDescription: e.target.value })}
          />
        </div>

        <div className="field-group">
          <label htmlFor="interview-project" className="field-label">
            {t.interview.projectLabel}
          </label>
          <textarea
            id="interview-project"
            className="text-input text-area"
            rows={3}
            value={details.projectSummary}
            placeholder={t.interview.projectPlaceholder}
            onChange={(e) => onChange({ ...details, projectSummary: e.target.value })}
          />
        </div>

        <div className="field-group">
          <span className="field-label">
            <span>{t.interview.cvLabel}</span>
            <span className="field-optional">{t.interview.cvOptional}</span>
          </span>

          <input
            ref={cvInputRef}
            id="interview-cv-input"
            type="file"
            accept=".pdf,.docx"
            className="sr-only"
            onChange={(e) => {
              handleCvSelected(e.target.files)
              e.target.value = ''
            }}
          />

          {details.cvFile ? (
            <div className="uploaded-file-row">
              <div className="uploaded-file-info">
                <span className="file-ext-badge">{details.cvFile.extension.toUpperCase()}</span>
                <div className="uploaded-file-text">
                  <span className="uploaded-file-name">{details.cvFile.name}</span>
                  <span className="uploaded-file-size">{formatFileSize(details.cvFile.sizeBytes)}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn-remove-inline"
                aria-label={`${t.interview.removeCv} ${details.cvFile.name}`}
                onClick={() => onChange({ ...details, cvFile: null })}
              >
                {t.interview.removeCv}
              </button>
            </div>
          ) : (
            <button
              id="interview-cv-upload-btn"
              type="button"
              className="cv-upload-btn"
              onClick={() => cvInputRef.current?.click()}
            >
              <span className="cv-upload-title">{t.interview.cvDropzoneTitle}</span>
              <span className="cv-upload-sub">{t.interview.cvDropzoneLimit}</span>
            </button>
          )}

          {cvError && (
            <div className="error-alert" role="alert">
              {cvError}
            </div>
          )}
        </div>
      </div>

      <div className="theme-preview-box" aria-live="polite">
        <p className="section-label" style={{ marginBottom: 4 }}>
          {t.interview.previewHeading}
        </p>
        <p className="section-hint" style={{ marginBottom: 10 }}>
          {t.interview.previewHint}
        </p>
        <div className="preview-chip-list">
          {previewChips.map((chip) => (
            <span key={chip} className="preview-chip">
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div className="wizard-footer-actions">
        <button
          id="wizard-interview-continue"
          type="button"
          className="btn-primary"
          disabled={isExtracting}
          onClick={onContinue}
        >
          {isExtracting ? t.extracting : t.continue}
        </button>
      </div>
    </div>
  )
}
