import { describe, expect, it } from 'vitest';
import { buildElevatedWorkerCommand } from '../../../src/main/services/ElevationService';

describe('buildElevatedWorkerCommand', () => {
  it('wraps every argument in embedded double quotes so paths with spaces survive Start-Process', () => {
    const command = buildElevatedWorkerCommand('C:\\App\\app.exe', [
      '--uninstall-worker',
      '--job-file=C:\\Users\\tech\\AppData\\Roaming\\NI Installation Manager\\uninstall-jobs\\job-1\\job.json',
    ]);
    expect(command).toContain(
      `-ArgumentList @('"--uninstall-worker"','"--job-file=C:\\Users\\tech\\AppData\\Roaming\\NI Installation Manager\\uninstall-jobs\\job-1\\job.json"')`,
    );
  });

  it('single-quotes the exe path for PowerShell', () => {
    const command = buildElevatedWorkerCommand('C:\\Program Files\\App\\app.exe', ['--x']);
    expect(command).toContain(`-FilePath 'C:\\Program Files\\App\\app.exe'`);
  });

  it('doubles embedded single quotes for the PowerShell string literals', () => {
    const command = buildElevatedWorkerCommand(`C:\\O'Brien\\app.exe`, [`--job-file=C:\\O'Brien\\job.json`]);
    expect(command).toContain(`-FilePath 'C:\\O''Brien\\app.exe'`);
    expect(command).toContain(`'"--job-file=C:\\O''Brien\\job.json"'`);
  });

  it('propagates the worker exit code', () => {
    const command = buildElevatedWorkerCommand('C:\\app.exe', ['--x']);
    expect(command).toContain('-Verb RunAs -PassThru -Wait; exit $p.ExitCode');
  });
});
