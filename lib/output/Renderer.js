/**
 * Holds all logic used render and output the final documentation.
 *
 * The [[Renderer]] class is the central controller within this namespace. When invoked it creates
 * an instance of [[BaseTheme]] which defines the layout of the documentation and fires a
 * series of [[OutputEvent]] events. Instances of [[BasePlugin]] can listen to these events and
 * alter the generated output.
 */
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var Path = require("path");
var FS = require("fs-extra");
var ProgressBar = require("progress");
var PluginHost_1 = require("../PluginHost");
var OutputEvent_1 = require("./events/OutputEvent");
var Utils_1 = require("../Utils");
var DefaultTheme_1 = require("./themes/DefaultTheme");
var Renderer = (function (_super) {
    __extends(Renderer, _super);
    function Renderer(application) {
        _super.call(this);
        this.templates = {};
        this.application = application;
        Renderer.loadPlugins(this);
    }
    Renderer.prototype.getParameters = function () {
        var result = _super.prototype.getParameters.call(this);
        this.prepareTheme();
        var theme = this.theme;
        if (theme.getParameters) {
            result = result.concat(theme.getParameters());
        }
        return result;
    };
    Renderer.prototype.getTemplate = function (fileName) {
        if (!this.theme) {
            this.application.logger.error('Cannot resolve templates before theme is set.');
            return null;
        }
        if (!this.templates[fileName]) {
            var path = Path.resolve(Path.join(this.theme.basePath, fileName));
            if (!FS.existsSync(path)) {
                path = Path.resolve(Path.join(Renderer.getDefaultTheme(), fileName));
                if (!FS.existsSync(path)) {
                    this.application.logger.error('Cannot find template %s', fileName);
                    return null;
                }
            }
            this.templates[fileName] = Handlebars.compile(Renderer.readFile(path), {
                preventIndent: true
            });
        }
        return this.templates[fileName];
    };
    Renderer.prototype.render = function (project, outputDirectory) {
        var _this = this;
        if (!this.prepareTheme() || !this.prepareOutputDirectory(outputDirectory)) {
            return;
        }
        var output = new OutputEvent_1.OutputEvent();
        output.outputDirectory = outputDirectory;
        output.project = project;
        output.settings = this.application.options;
        output.urls = this.theme.getUrls(project);
        var bar = new ProgressBar('Rendering [:bar] :percent', {
            total: output.urls.length,
            width: 40
        });
        this.dispatch(Renderer.EVENT_BEGIN, output);
        if (!output.isDefaultPrevented) {
            output.urls.forEach(function (mapping) {
                _this.renderDocument(output.createPageEvent(mapping));
                bar.tick();
            });
            this.dispatch(Renderer.EVENT_END, output);
        }
    };
    Renderer.prototype.renderDocument = function (page) {
        this.dispatch(Renderer.EVENT_BEGIN_PAGE, page);
        if (page.isDefaultPrevented) {
            return false;
        }
        page.template = page.template || this.getTemplate(Path.join('templates', page.templateName));
        page.contents = page.template(page);
        this.dispatch(Renderer.EVENT_END_PAGE, page);
        if (page.isDefaultPrevented) {
            return false;
        }
        try {
            Utils_1.writeFile(page.filename, page.contents, false);
        }
        catch (error) {
            this.application.logger.error('Could not write %s', page.filename);
            return false;
        }
        return true;
    };
    Renderer.prototype.prepareTheme = function () {
        if (!this.theme) {
            var themeName = this.application.options.theme;
            var path = Path.resolve(themeName);
            if (!FS.existsSync(path)) {
                path = Path.join(Renderer.getThemeDirectory(), themeName);
                if (!FS.existsSync(path)) {
                    this.application.logger.error('The theme %s could not be found.', themeName);
                    return false;
                }
            }
            var filename = Path.join(path, 'theme.js');
            if (!FS.existsSync(filename)) {
                this.theme = new DefaultTheme_1.DefaultTheme(this, path);
            }
            else {
                var themeClass = eval(Renderer.readFile(filename));
                this.theme = new themeClass(this, path);
            }
        }
        return true;
    };
    Renderer.prototype.prepareOutputDirectory = function (directory) {
        if (FS.existsSync(directory)) {
            if (!FS.statSync(directory).isDirectory()) {
                this.application.logger.error('The output target "%s" exists but it is not a directory.', directory);
                return false;
            }
            if (FS.readdirSync(directory).length == 0) {
                return true;
            }
            if (!this.theme.isOutputDirectory(directory)) {
                this.application.logger.error('The output directory "%s" exists but does not seem to be a documentation generated by TypeDoc.\n' +
                    'Make sure this is the right target directory, delete the folder and rerun TypeDoc.', directory);
                return false;
            }
            try {
                FS.removeSync(directory);
            }
            catch (error) {
                this.application.logger.warn('Could not empty the output directory.');
            }
        }
        if (!FS.existsSync(directory)) {
            try {
                FS.mkdirpSync(directory);
            }
            catch (error) {
                this.application.logger.error('Could not create output directory %s', directory);
                return false;
            }
        }
        return true;
    };
    Renderer.getThemeDirectory = function () {
        return Path.dirname(require.resolve('typedoc-default-themes'));
    };
    Renderer.getDefaultTheme = function () {
        return Path.join(Renderer.getThemeDirectory(), 'default');
    };
    Renderer.readFile = function (file) {
        var buffer = FS.readFileSync(file);
        switch (buffer[0]) {
            case 0xFE:
                if (buffer[1] === 0xFF) {
                    var i = 0;
                    while ((i + 1) < buffer.length) {
                        var temp = buffer[i];
                        buffer[i] = buffer[i + 1];
                        buffer[i + 1] = temp;
                        i += 2;
                    }
                    return buffer.toString("ucs2", 2);
                }
                break;
            case 0xFF:
                if (buffer[1] === 0xFE) {
                    return buffer.toString("ucs2", 2);
                }
                break;
            case 0xEF:
                if (buffer[1] === 0xBB) {
                    return buffer.toString("utf8", 3);
                }
        }
        return buffer.toString("utf8", 0);
    };
    Renderer.EVENT_BEGIN = 'beginRender';
    Renderer.EVENT_END = 'endRender';
    Renderer.EVENT_BEGIN_PAGE = 'beginPage';
    Renderer.EVENT_END_PAGE = 'endPage';
    return Renderer;
})(PluginHost_1.PluginHost);
exports.Renderer = Renderer;