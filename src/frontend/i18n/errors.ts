import { ApiError } from '../api.js';
import type { Texts } from './de.js';

/**
 * Übersetzt einen Fehler in die Sprache der Oberfläche.
 *
 * Das Backend liefert zu jedem Fehler einen Code *und* eine deutsche Meldung.
 * Die Meldung kann es nicht übersetzen -- es kennt die Sprache des Browsers
 * nicht, und sie gehört nicht in die Domäne. Also gewinnt hier die übersetzte
 * Fassung, wo es eine gibt; sonst bleibt die Meldung des Servers stehen.
 *
 * Das ist bewusst kein Alles-oder-nichts: Eine deutsche Detailmeldung ist
 * besser als ein englisches "Something went wrong", das nichts sagt.
 */
export const translateError = (texts: Texts, error: unknown): string => {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return texts.errors.serverUnreachable;
      case 'CONFIG_ERROR':
        return texts.errors.configUnavailable;
      default:
        return texts.errors.byCode[error.code] ?? error.message;
    }
  }

  return error instanceof Error ? error.message : texts.errors.unexpected;
};
