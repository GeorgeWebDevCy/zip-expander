import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { ILLUSTRATION_PATHS } from "../src/shared/assets";
import type { PasswordRequest, QueueEvent, QueueJobState } from "../src/shared/types";

interface DraftJob {
  zipPath: string;
  destinationPath: string;
}

const initialDraft: DraftJob = {
  zipPath: "",
  destinationPath: ""
};

const statusLabel: Record<QueueJobState["status"], string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled"
};

const statusClass: Record<QueueJobState["status"], string> = {
  queued: "status-queued",
  running: "status-running",
  completed: "status-completed",
  failed: "status-failed",
  cancelled: "status-cancelled"
};

const applyQueueEvent = (prev: QueueJobState[], event: QueueEvent): QueueJobState[] => {
  if (event.type === "snapshot") {
    return event.jobs;
  }

  if (event.type === "job-updated") {
    const idx = prev.findIndex((job) => job.id === event.job.id);
    if (idx < 0) {
      return [...prev, event.job];
    }

    const next = [...prev];
    next[idx] = event.job;
    return next;
  }

  return prev;
};

const leaf = (value: string): string => {
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? value;
};

export default function HomePage() {
  const [draft, setDraft] = useState<DraftJob>(initialDraft);
  const [jobs, setJobs] = useState<QueueJobState[]>([]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [passwordRequest, setPasswordRequest] = useState<PasswordRequest | null>(null);
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("Add your first archive to start.");
  const api = typeof window !== "undefined" ? window.desktopApi : undefined;

  useEffect(() => {
    if (!api) {
      return;
    }

    void api.queueList().then((snapshot) => {
      setJobs(snapshot);
      setQueueRunning(snapshot.some((item) => item.status === "running"));
    });

    const unsubQueue = api.onQueueEvent((event) => {
      setJobs((prev) => applyQueueEvent(prev, event));

      if (event.type === "queue-started") {
        setQueueRunning(true);
        setNotice("Queue is running.");
      }

      if (event.type === "queue-finished") {
        setQueueRunning(false);
        setNotice(event.cancelled ? "Queue cancelled." : "Queue finished.");
      }

      if (event.type === "job-updated" && event.job.status === "failed") {
        setNotice(`Job failed: ${event.job.error ?? event.job.id}`);
      }
    });

    const unsubPassword = api.onPasswordRequest((request) => {
      setPassword("");
      setPasswordRequest(request);
      setNotice("Password required for encrypted archive.");
    });

    return () => {
      unsubQueue();
      unsubPassword();
    };
  }, [api]);

  const summary = useMemo(() => {
    const byStatus = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    let extracted = 0;
    let renamed = 0;
    let nested = 0;

    for (const job of jobs) {
      byStatus[job.status] += 1;
      extracted += job.extractedCount;
      renamed += job.renamedCount;
      nested += job.nestedZipCount;
    }

    const completionRate =
      jobs.length > 0 ? Math.round((byStatus.completed / jobs.length) * 100) : 0;

    return {
      ...byStatus,
      extracted,
      renamed,
      nested,
      total: jobs.length,
      completionRate
    };
  }, [jobs]);

  const activeIllustration =
    summary.failed > 0
      ? ILLUSTRATION_PATHS.errorState
      : summary.running > 0
        ? ILLUSTRATION_PATHS.processing
        : ILLUSTRATION_PATHS.emptyQueue;

  const canAdd = Boolean(draft.zipPath && draft.destinationPath);
  const canStart = jobs.some((job) => job.status === "queued");

  const onBrowseZip = async () => {
    if (!api) {
      return;
    }

    const selected = await api.pickZipFile();
    if (!selected) {
      return;
    }

    setDraft((prev) => ({ ...prev, zipPath: selected }));
  };

  const onBrowseDestination = async () => {
    if (!api) {
      return;
    }

    const selected = await api.pickDestinationFolder();
    if (!selected) {
      return;
    }

    setDraft((prev) => ({ ...prev, destinationPath: selected }));
  };

  const onAddJob = async () => {
    if (!api) {
      return;
    }

    if (!canAdd) {
      setNotice("Pick both ZIP and destination.");
      return;
    }

    await api.queueAdd({
      id: crypto.randomUUID(),
      zipPath: draft.zipPath,
      destinationPath: draft.destinationPath
    });

    setJobs(await api.queueList());
    setDraft((prev) => ({ ...prev, zipPath: "" }));
    setNotice("Job queued.");
  };

  const onRemoveJob = async (jobId: string) => {
    if (!api) {
      return;
    }

    const removed = await api.queueRemove(jobId);
    if (!removed) {
      setNotice("Cannot remove running job.");
      return;
    }

    setJobs(await api.queueList());
    setNotice("Job removed.");
  };

  const onStartQueue = async () => {
    if (!api) {
      return;
    }

    if (!canStart) {
      setNotice("No queued jobs.");
      return;
    }

    await api.queueStart();
  };

  const onCancelQueue = async () => {
    if (!api) {
      return;
    }

    await api.queueCancel();
    setNotice("Cancellation requested.");
  };

  const onSubmitPassword = async () => {
    if (!api || !passwordRequest || !password) {
      return;
    }

    await api.submitPassword({
      requestId: passwordRequest.requestId,
      password
    });

    setPasswordRequest(null);
    setPassword("");
    setNotice("Password submitted.");
  };

  const onCancelPassword = async () => {
    if (!api || !passwordRequest) {
      return;
    }

    await api.cancelPassword(passwordRequest.requestId);
    setPasswordRequest(null);
    setPassword("");
    setNotice("Password prompt cancelled.");
  };

  return (
    <>
      <Head>
        <title>Zip Expander</title>
      </Head>
      <main className="studio">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Windows ZIP Workspace</p>
            <h1>Zip Expander</h1>
            <p>
              Build extraction batches, flatten all nested content into destination root, and track
              every job in one interface.
            </p>
            <div className="chip-row">
              <span className={`chip ${queueRunning ? "chip-live" : "chip-idle"}`}>
                {queueRunning ? "Queue Active" : "Queue Idle"}
              </span>
              <span className="chip">Queued {summary.queued}</span>
              <span className="chip">Done {summary.completed}</span>
              <span className="chip">Rate {summary.completionRate}%</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <img src={activeIllustration} alt="" />
          </div>
        </section>

        <section className="workspace">
          <article className="panel compose-panel">
            <div className="panel-top">
              <h2>New Job</h2>
              <p>Select archive and destination.</p>
            </div>

            {!api && (
              <div className="warning">
                Desktop API unavailable. Open this page via the Electron desktop app.
              </div>
            )}

            <label className="field">
              <span>ZIP file</span>
              <div className="input-row">
                <input
                  value={draft.zipPath}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      zipPath: event.currentTarget.value
                    }))
                  }
                  placeholder="C:\\archives\\package.zip"
                />
                <button type="button" onClick={onBrowseZip}>
                  Browse
                </button>
              </div>
            </label>

            <label className="field">
              <span>Destination root</span>
              <div className="input-row">
                <input
                  value={draft.destinationPath}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      destinationPath: event.currentTarget.value
                    }))
                  }
                  placeholder="D:\\output"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void onAddJob();
                    }
                  }}
                />
                <button type="button" onClick={onBrowseDestination}>
                  Browse
                </button>
              </div>
            </label>

            <div className="action-row">
              <button type="button" className="primary" onClick={onAddJob} disabled={!canAdd}>
                Add To Queue
              </button>
              <button type="button" onClick={onStartQueue} disabled={queueRunning || !canStart}>
                Start Queue
              </button>
              <button type="button" onClick={onCancelQueue} disabled={!queueRunning}>
                Cancel
              </button>
            </div>

            <div className="notice">
              <span>Notice</span>
              <p>{notice}</p>
            </div>
          </article>

          <article className="panel queue-panel">
            <div className="panel-top">
              <h2>Job Queue</h2>
              <p>{summary.total} total jobs</p>
            </div>

            {jobs.length === 0 ? (
              <div className="empty-state">
                <img src={ILLUSTRATION_PATHS.emptyQueue} alt="" />
                <h3>No jobs yet</h3>
                <p>Create your first extraction job from the left panel.</p>
              </div>
            ) : (
              <ul className="job-list">
                {jobs.map((job) => (
                  <li key={job.id} className={`job-card ${statusClass[job.status]}`}>
                    <div className="job-head">
                      <div>
                        <h3>{leaf(job.zipPath)}</h3>
                        <p title={job.zipPath}>{job.zipPath}</p>
                      </div>
                      <span className={`status-pill ${statusClass[job.status]}`}>
                        {statusLabel[job.status]}
                      </span>
                    </div>

                    <div className="job-destination" title={job.destinationPath}>
                      Destination: {job.destinationPath}
                    </div>

                    <div className={`progress ${job.status === "running" ? "running" : ""}`}>
                      <span style={{ width: `${Math.max(2, job.progressPct)}%` }} />
                    </div>

                    <div className="job-meta">
                      <p>{job.message ?? "-"}</p>
                      <div className="kpis">
                        <span>Files {job.extractedCount}</span>
                        <span>Renamed {job.renamedCount}</span>
                        <span>Nested {job.nestedZipCount}</span>
                        <span>{job.reportPath ? "Report Ready" : "Report Pending"}</span>
                      </div>
                    </div>

                    <div className="job-actions">
                      <button
                        type="button"
                        onClick={() => onRemoveJob(job.id)}
                        disabled={job.status === "running"}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="panel metrics-panel">
            <div className="panel-top">
              <h2>Queue Insights</h2>
              <p>Live counters from all jobs.</p>
            </div>

            <div className="metric-grid">
              <div>
                <span>Queued</span>
                <strong>{summary.queued}</strong>
              </div>
              <div>
                <span>Running</span>
                <strong>{summary.running}</strong>
              </div>
              <div>
                <span>Completed</span>
                <strong>{summary.completed}</strong>
              </div>
              <div>
                <span>Failed</span>
                <strong>{summary.failed}</strong>
              </div>
              <div>
                <span>Cancelled</span>
                <strong>{summary.cancelled}</strong>
              </div>
              <div>
                <span>Files</span>
                <strong>{summary.extracted}</strong>
              </div>
              <div>
                <span>Renamed</span>
                <strong>{summary.renamed}</strong>
              </div>
              <div>
                <span>Nested ZIPs</span>
                <strong>{summary.nested}</strong>
              </div>
            </div>

            <div className="completion-box">
              <div className="completion-head">
                <span>Completion</span>
                <strong>{summary.completionRate}%</strong>
              </div>
              <div className="completion-track">
                <span style={{ width: `${summary.completionRate}%` }} />
              </div>
            </div>
          </article>
        </section>
      </main>

      {passwordRequest && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="eyebrow">Encrypted Archive</p>
            <h3>Password Required</h3>
            <p>
              Job <code>{passwordRequest.jobId}</code> needs a password.
            </p>
            <p title={passwordRequest.archivePath}>
              Archive: <code>{passwordRequest.archivePath}</code>
            </p>
            <p>Attempt {passwordRequest.attempt} of 3.</p>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder="Enter ZIP password"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void onSubmitPassword();
                }
              }}
            />
            <div className="modal-actions">
              <button type="button" className="primary" onClick={onSubmitPassword}>
                Submit Password
              </button>
              <button type="button" onClick={onCancelPassword}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

