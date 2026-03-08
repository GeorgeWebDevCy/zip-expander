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

export default function HomePage() {
  const [draft, setDraft] = useState<DraftJob>(initialDraft);
  const [jobs, setJobs] = useState<QueueJobState[]>([]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [passwordRequest, setPasswordRequest] = useState<PasswordRequest | null>(null);
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("Ready.");
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
        setNotice("Queue running...");
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

    return {
      ...byStatus,
      extracted,
      renamed,
      nested,
      total: jobs.length
    };
  }, [jobs]);

  const onBrowseZip = async () => {
    if (!api) {
      return;
    }

    const filePath = await api.pickZipFile();
    if (!filePath) {
      return;
    }

    setDraft((prev) => ({ ...prev, zipPath: filePath }));
  };

  const onBrowseDestination = async () => {
    if (!api) {
      return;
    }

    const folderPath = await api.pickDestinationFolder();
    if (!folderPath) {
      return;
    }

    setDraft((prev) => ({ ...prev, destinationPath: folderPath }));
  };

  const onAddJob = async () => {
    if (!api) {
      return;
    }

    if (!draft.zipPath || !draft.destinationPath) {
      setNotice("Select both ZIP path and destination path.");
      return;
    }

    const id = crypto.randomUUID();
    await api.queueAdd({
      id,
      zipPath: draft.zipPath,
      destinationPath: draft.destinationPath
    });

    const snapshot = await api.queueList();
    setJobs(snapshot);
    setDraft((prev) => ({ ...prev, zipPath: "" }));
    setNotice("Job added to queue.");
  };

  const onRemoveJob = async (jobId: string) => {
    if (!api) {
      return;
    }

    const removed = await api.queueRemove(jobId);
    if (!removed) {
      setNotice("Could not remove that job (it may be running).");
      return;
    }

    const snapshot = await api.queueList();
    setJobs(snapshot);
    setNotice("Job removed.");
  };

  const onStartQueue = async () => {
    if (!api) {
      return;
    }

    if (jobs.filter((job) => job.status === "queued").length === 0) {
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
    setNotice("Cancellation requested...");
  };

  const onSubmitPassword = async () => {
    if (!api || !passwordRequest) {
      return;
    }

    if (!password) {
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
    setNotice("Password request cancelled.");
  };

  return (
    <>
      <Head>
        <title>Zip Expander</title>
      </Head>
      <main className="layout">
        <section className="panel composer">
          <h1>Zip Expander</h1>
          <p>
            Queue one or more ZIP files. Each job extracts recursively and flattens files into
            destination root.
          </p>

          {!api && (
            <div className="warning">
              Desktop API unavailable. Open this page through Electron instead of a normal browser.
            </div>
          )}

          <div className="field-grid">
            <label>
              ZIP file
              <div className="input-row">
                <input
                  value={draft.zipPath}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      zipPath: event.currentTarget.value
                    }))
                  }
                  placeholder="C:\\path\\archive.zip"
                />
                <button onClick={onBrowseZip} type="button">
                  Browse
                </button>
              </div>
            </label>
            <label>
              Destination folder
              <div className="input-row">
                <input
                  value={draft.destinationPath}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      destinationPath: event.currentTarget.value
                    }))
                  }
                  placeholder="C:\\path\\destination"
                />
                <button onClick={onBrowseDestination} type="button">
                  Browse
                </button>
              </div>
            </label>
          </div>

          <div className="actions">
            <button onClick={onAddJob} type="button" className="primary">
              Add to Queue
            </button>
            <button onClick={onStartQueue} type="button" disabled={queueRunning}>
              Start Queue
            </button>
            <button onClick={onCancelQueue} type="button" disabled={!queueRunning}>
              Cancel Queue
            </button>
          </div>

          <div className="notice">{notice}</div>
        </section>

        <section className="panel queue">
          <header>
            <h2>Job Queue</h2>
            <span>{summary.total} jobs</span>
          </header>

          {jobs.length === 0 ? (
            <div className="empty-state">
              <img src={ILLUSTRATION_PATHS.emptyQueue} alt="" />
              <p>No jobs queued yet.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ZIP</th>
                    <th>Destination</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Report</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td title={job.zipPath}>{job.zipPath}</td>
                      <td title={job.destinationPath}>{job.destinationPath}</td>
                      <td className={`status ${job.status}`}>{statusLabel[job.status]}</td>
                      <td>
                        <div className={`progress ${job.status === "running" ? "running" : ""}`}>
                          <div style={{ width: `${job.progressPct}%` }} />
                        </div>
                        <small>{job.message ?? "-"}</small>
                      </td>
                      <td title={job.reportPath}>{job.reportPath ? "Saved" : "-"}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => onRemoveJob(job.id)}
                          disabled={job.status === "running"}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel summary">
          <h2>Summary</h2>
          <div className="summary-grid">
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
              <span>Extracted Files</span>
              <strong>{summary.extracted}</strong>
            </div>
            <div>
              <span>Renamed Collisions</span>
              <strong>{summary.renamed}</strong>
            </div>
            <div>
              <span>Nested ZIPs</span>
              <strong>{summary.nested}</strong>
            </div>
          </div>
        </section>
      </main>

      {passwordRequest && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Password Required</h3>
            <p>
              Encrypted archive detected for job <code>{passwordRequest.jobId}</code>.
            </p>
            <p>
              Attempt {passwordRequest.attempt} of 3 for:
              <br />
              <code>{passwordRequest.archivePath}</code>
            </p>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder="Enter archive password"
              autoFocus
            />
            <div className="modal-actions">
              <button onClick={onSubmitPassword} type="button" className="primary">
                Submit
              </button>
              <button onClick={onCancelPassword} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
