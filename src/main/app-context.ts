import {
  getFrontendAssetsCachePath,
  getLogFilePath,
  getProductDiskUsageCachePath,
  getRenamePatternsFilePath,
  getSettingsFilePath,
  getUninstallJobsPath,
} from '../config/paths';
import cdnAssets from '../config/na_cdn-assets.json';
import { ArtworkCacheService } from './services/ArtworkCacheService';
import { BackupService } from './services/BackupService';
import { ProductDiskUsageCache } from './services/ProductDiskUsageCache';
import { ProductDiskUsageService } from './services/ProductDiskUsageService';
import { ElevationService } from './services/ElevationService';
import { LoggerService } from './services/LoggerService';
import { MoveService } from './services/MoveService';
import { ProductDetailsService } from './services/ProductDetailsService';
import { ProductScanService } from './services/ProductScanService';
import { RegistryService } from './services/RegistryService';
import { RestoreAsService } from './services/RestoreAsService';
import { RestoreDetailsService } from './services/RestoreDetailsService';
import { RestoreScanService } from './services/RestoreScanService';
import { RestoreService } from './services/RestoreService';
import { SettingsService } from './services/SettingsService';
import { UninstallService } from './services/UninstallService';
import { ProductStore } from './stores/ProductStore';
import { RestoreStore } from './stores/RestoreStore';
import { SettingsStore } from './stores/SettingsStore';
import { UninstallJobStore } from './stores/UninstallJobStore';
import { ArtworkImageProcessor } from './utils/ArtworkImageProcessor';
import { FsGuard } from './utils/FsGuard';
import { RegistryGuard } from './utils/RegistryGuard';

/**
 * Composition root of the main process: creates and wires all singletons
 * (stores, services, guards) in dependency order. `main.ts` builds one
 * `AppContext` after Electron is ready and hands it to the IPC registrar
 * and store-sync layer — no service wiring anywhere else.
 */
export interface AppContext {
  logger: LoggerService;
  settingsStore: SettingsStore;
  settingsService: SettingsService;
  fsGuard: FsGuard;
  registryGuard: RegistryGuard;
  registryService: RegistryService;
  productStore: ProductStore;
  productScanService: ProductScanService;
  artworkCacheService: ArtworkCacheService;
  productDiskUsageCache: ProductDiskUsageCache;
  productDiskUsageService: ProductDiskUsageService;
  uninstallJobStore: UninstallJobStore;
  uninstallService: UninstallService;
  productDetailsService: ProductDetailsService;
  restoreStore: RestoreStore;
  restoreScanService: RestoreScanService;
  restoreDetailsService: RestoreDetailsService;
  restoreService: RestoreService;
  restoreAsService: RestoreAsService;
  moveService: MoveService;
}

/**
 * Build the fully wired application context. Requires the Electron `app` to
 * be ready (path resolution) and loads persisted settings before returning,
 * so every consumer sees initialized settings from the start.
 */
export function createAppContext(cliArgs: readonly string[]): AppContext {
  const logger = new LoggerService();
  logger.initializeFileSink(getLogFilePath());

  const settingsStore = new SettingsStore();
  const settingsService = new SettingsService(settingsStore, logger, getSettingsFilePath());
  settingsService.load(cliArgs);

  const fsGuard = new FsGuard(settingsStore, logger);
  const registryGuard = new RegistryGuard(settingsStore, logger);

  const registryService = new RegistryService(logger);
  // Destructive registry ops now have a real backend — still only reachable
  // through the guard (dry-run enforcement).
  registryGuard.setBackend(registryService);

  const productStore = new ProductStore();
  const artworkCacheService = new ArtworkCacheService(
    productStore,
    logger,
    getFrontendAssetsCachePath(),
    cdnAssets,
    new ArtworkImageProcessor(),
  );
  const productDiskUsageCache = new ProductDiskUsageCache(getProductDiskUsageCachePath(), logger);
  const productDiskUsageService = new ProductDiskUsageService(
    productStore,
    logger,
    productDiskUsageCache,
  );
  const productScanService = new ProductScanService(
    registryService,
    productStore,
    logger,
    artworkCacheService,
    productDiskUsageService,
  );

  const uninstallJobStore = new UninstallJobStore();
  const elevationService = new ElevationService(logger);
  const uninstallService = new UninstallService(
    settingsStore,
    productStore,
    uninstallJobStore,
    fsGuard,
    registryGuard,
    new BackupService(),
    elevationService,
    logger,
    getUninstallJobsPath(),
  );

  const productDetailsService = new ProductDetailsService(productStore, logger);

  const restoreStore = new RestoreStore();
  const restoreScanService = new RestoreScanService(
    settingsStore,
    restoreStore,
    artworkCacheService,
    logger,
  );
  const restoreDetailsService = new RestoreDetailsService(restoreStore, logger);
  const restoreAsService = new RestoreAsService(restoreStore, logger, getRenamePatternsFilePath());
  // Restore jobs share the uninstall job store (one job at a time, one
  // progress page) and the elevated-worker job folder.
  const restoreService = new RestoreService(
    settingsStore,
    restoreStore,
    uninstallJobStore,
    registryGuard,
    elevationService,
    productDiskUsageCache,
    logger,
    getUninstallJobsPath(),
  );

  // Move jobs (TODO10) share the job store, worker job folder and progress
  // page too; the data source is the scanned product store (registry).
  const moveService = new MoveService(
    settingsStore,
    productStore,
    uninstallJobStore,
    registryGuard,
    elevationService,
    productScanService,
    logger,
    getUninstallJobsPath(),
  );

  logger.info('Application context initialized', 'AppContext');

  return {
    logger,
    settingsStore,
    settingsService,
    fsGuard,
    registryGuard,
    registryService,
    productStore,
    productScanService,
    artworkCacheService,
    productDiskUsageCache,
    productDiskUsageService,
    uninstallJobStore,
    uninstallService,
    productDetailsService,
    restoreStore,
    restoreScanService,
    restoreDetailsService,
    restoreService,
    restoreAsService,
    moveService,
  };
}
