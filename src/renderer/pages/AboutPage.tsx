import React, { useEffect, useState } from 'react';

/** Placeholder repository URL until a real project page exists (PLAN.md §4.5). */
const PROJECT_URL = 'https://github.com/andreashe/ni-installation-manager';

/**
 * About page (PLAN.md §4.5): version, unofficial-status disclaimer, project
 * link, license note. The version comes from main via IPC
 * (`app.getVersion()` → package.json), so it is never duplicated in source.
 */
export function AboutPage() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    void window.api.app.getVersion().then(setVersion);
  }, []);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">About</h1>
      </div>

      <div className="about-body">
        <p>
          <strong>NI Installation Manager</strong>
          {version !== '' && <span className="about-version"> — Version {version}</span>}
          {' '}is an independent, community-built tool to inspect and uninstall Native
          Instruments products.
        </p>

        <h2>Not an official Native Instruments application</h2>
        <p>
          This software is <strong>not</strong> affiliated with, endorsed by, or supported by
          Native Instruments GmbH. All product names and artwork belong to their respective
          owners.
        </p>

        <h2>No warranty — use at your own risk</h2>
        <p>
          The application modifies the Windows registry and deletes files. It is provided
          &quot;as is&quot;, without guarantees of any kind. Always keep backups; enable the
          built-in backup option in Preferences before uninstalling.
        </p>
        <p>
          Warning: Do not use it to uninstall drivers. It is just made for instruments.
        </p>

        <h2>Source &amp; license</h2>
        <p>
          More information, source code and issue tracker:{' '}
          <a href={PROJECT_URL} target="_blank" rel="noreferrer">
            {PROJECT_URL}
          </a>
        </p>
        <p>
          Licensed under the <strong>PolyForm Noncommercial License 1.0.0</strong>: you may
          clone, modify and share this software, but selling it is prohibited. A reference to
          this original project must be preserved.
        </p>
      </div>
    </>
  );
}
