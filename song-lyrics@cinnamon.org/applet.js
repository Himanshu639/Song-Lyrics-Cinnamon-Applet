const St = imports.gi.St;
const Applet = imports.ui.applet;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;

function MyApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.TextApplet.prototype._init.call(this, orientation, panel_height, instance_id);
        this.set_applet_label("Show Lyrics!");
        this._lyricsInterval = null;
    },

    // Improved _fetchLyrics function (asynchronous) with more status messages
    _fetchLyrics: function(query) {
        // Immediately inform the user that lyrics are being fetched
        this.set_applet_label("Fetching lyrics...");
        
        // Build the command array to avoid shell quoting issues
        let argv = [
            "/home/cyrenix/.local/bin/syncedlyrics",
            query,
            "-o", "/dev/null",
            "--synced-only"
        ];
        global.log("Executing command:", argv.join(" "));

        let proc = new Gio.Subprocess({
            argv: argv,
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        });
        proc.init(null);

        proc.communicate_utf8_async(null, null, Lang.bind(this, function(proc, res) {
            let ok, stdout, stderr;
            try {
                [ok, stdout, stderr] = proc.communicate_utf8_finish(res);
            } catch (e) {
                this.set_applet_label("Error fetching lyrics");
                return;
            }
            let outputStr = stdout.toString().trim();
            if (outputStr === "") {
                // Inform the user that no lyrics were found.
                // Also try shortening the query if possible.
                let lastSpace = query.lastIndexOf(' ');
                if (lastSpace !== -1) {
                    this.set_applet_label("No results. Trying shorter query...");
                    query = query.slice(0, lastSpace);
                    this._fetchLyrics(query);
                } else {
                    this.set_applet_label("No lyrics available");
                }
                return;
            }
            // Let the user know that lyrics are being parsed.
            this.set_applet_label("Parsing lyrics...");
            
            let lines = outputStr.split('\n');
            let lyricsArray = [];
            // Regex to capture [mm:ss.xx] followed by text.
            let regex = /^\[(\d{2}):(\d{2}\.\d{2})\](.*)$/;
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                let match = line.match(regex);
                if (match) {
                    let minutes = parseInt(match[1]);
                    let secondsFraction = parseFloat(match[2]);
                    let totalSeconds = minutes * 60 + secondsFraction;
                    let lyricText = match[3].trim();
                    // If lyric text is empty, show a music note.
                    if (lyricText === "") {
                        lyricText = "♫";
                    }
                    lyricsArray.push({ seconds: totalSeconds, lyrics: lyricText });
                }
            }
            if (lyricsArray.length === 0) {
                this.set_applet_label("No valid lyrics found");
                return;
            }
            
            // Inform the user that syncing is starting.
            this.set_applet_label("Syncing lyrics...");
            this._displayLyrics(lyricsArray);
        }));
    },

    // _displayLyrics now remains similar, scheduling the lyric sync.
    _displayLyrics: function(lyrics) {
        // Get the current playback position
        let [res, posOut, posErr, posStatus] = GLib.spawn_command_line_sync('playerctl position');
        let currentPos = parseFloat(posOut.toString().trim());
        // Calculate offset based on system clock
        let startTime = Math.round(Date.now() / 1000) - currentPos;

        // If the song is already playing, skip to the appropriate lyric
        let line = 0;
        while (line < lyrics.length && currentPos > lyrics[line].seconds) {
            line++;
        }
        // Display a brief message if the user is behind the first lyric
        if (line === 0) {
            this.set_applet_label("Waiting for lyrics...");
        }

        const checkLyrics = Lang.bind(this, () => {
            let currentTime = Math.round(Date.now() / 1000) - startTime;
            if (line < lyrics.length && currentTime >= lyrics[line].seconds) {
                this.set_applet_label(lyrics[line].lyrics);
                line++;
            }
            if (line >= lyrics.length) {
                clearInterval(this._lyricsInterval);
                this._lyricsInterval = null;
                // Once finished, reset to the original state
                this.set_applet_label("Show Lyrics!");
            }
        });

        this._lyricsInterval = setInterval(checkLyrics, 500);
    },

    // on_applet_clicked now displays immediate feedback and cancels any running lyric sync
    on_applet_clicked: function() {
        if (this._lyricsInterval) {
            clearInterval(this._lyricsInterval);
            this._lyricsInterval = null;
        }
    
        this.set_applet_label("Fetching lyrics...");
    
        let [resTitle, outTitle, errTitle, statusTitle] = GLib.spawn_command_line_sync('playerctl metadata title');
        let [resArtist, outArtist, errArtist, statusArtist] = GLib.spawn_command_line_sync('playerctl metadata artist');
    
        if (statusTitle == 0 && statusArtist == 0) {
            let title = outTitle.toString().trim();

            // Cut off at brackets or pipe
            let cutIndex = title.search(/[\(\[\{\|]/);
            if (cutIndex !== -1) {
                title = title.substring(0, cutIndex).trim();
            }

            
            let artist = outArtist.toString().trim();
    
            // Clean up and encode for shell
            let query = `${title} ${artist}`;

            // Keep only first 5 words
            query = query.split(/\s+/).slice(0, 5).join(" ");

            this._fetchLyrics(query);
        } else {
            this.set_applet_label("Unable to get song info");
        }
    },
};

function main(metadata, orientation, panel_height, instance_id) {
    return new MyApplet(orientation, panel_height, instance_id);
}
