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

        // Set the initial text of the applet
        this.set_applet_label("Get Lyrics");

        this._lyricsInterval = null;

    },

    _fetchLyrics: function(query) {
        // Fetch the lyrics using curl
        let [res, out, err, status] = GLib.spawn_command_line_sync(`curl -k --get https://api.textyl.co/api/lyrics?q=${query}`);

        if (status == 0) {
            // Parse the JSON response
            let output = out.toString();
            if(output == "No lyrics available") {
                this.set_applet_label("No lyrics available");
            } else {
                this.set_applet_label('...');
                let lyrics = JSON.parse(out.toString());
                this._displayLyrics(lyrics);
            }
        } else {
            // Handle errors in fetching lyrics
            this.set_applet_label("Failed to fetch lyrics");
        }
    },

    _displayLyrics: function(lyrics) {
        let line = 0;
        let [res, out, err, status] = GLib.spawn_command_line_sync('playerctl position');
        let startTime = Math.round(Date.now() / 1000) - Math.round(out.toString()); // Start time in seconds
        
        while(Math.round(out.toString())>lyrics[line]["seconds"]) {
            line++;
        }
        // startTime -= Math.round(out.toString());

        const checkLyrics = Lang.bind(this, () => {
            let currentTime = Math.round(Date.now() / 1000) - startTime; // Elapsed time in seconds

            if(currentTime>=lyrics[line]["seconds"]) {
                this.set_applet_label(lyrics[line]["lyrics"]);
                line++;
            }
            if (line >= lyrics.length) {
                clearInterval(this._lyricsInterval);
                this._lyricsInterval = null;
                this.set_applet_label("Get Lyrics");
            }
        });

        // Check every 500 milliseconds
        // GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, checkLyrics);
        this._lyricsInterval = setInterval(checkLyrics, 500);
    },

    on_applet_clicked: function() {

        if (this._lyricsInterval) {
            clearInterval(this._lyricsInterval);
            this._lyricsInterval = null;
        }

        let [res, out, err, status] = GLib.spawn_command_line_sync('playerctl metadata title');

        if (status == 0) {
            // If the command executed successfully, update the applet label
            let title = out.toString().replace(/\s+/g, '');
            let index = title.indexOf('|');
            if (index === -1) {
                index = title.indexOf('(');
                if(index===-1) {
                    index.title.indexOf('[');
                }
            }
            title = index !== -1 ? title.substring(0, index) : title;
            this._fetchLyrics(title);
        } else {
            this.set_applet_label("Get Lyrics")
        }

        // You can trigger a manual refresh or any other action here if needed
         // Re-fetch lyrics when clicked (you can customize this)
    },
};

function main(metadata, orientation, panel_height, instance_id) {
    return new MyApplet(orientation, panel_height, instance_id);
}
