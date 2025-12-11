
import fs from 'fs';

function logError(msg) {
    try {
        fs.appendFileSync('debug_error.log', new Date().toISOString() + ': ' + msg + '\n');
    } catch (e) { }
}
