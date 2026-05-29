"""
RoadSoS - Emergency Response System
Entry point: initializes Flask app and registers all route blueprints.
"""

from flask import Flask
from backend.routes.emergency import emergency_bp
from backend.routes.routing import routing_bp
from backend.routes.reports import reports_bp

def create_app():
    app = Flask(
        __name__,
        template_folder="frontend/templates",
        static_folder="frontend/static"
    )

    app.config["SECRET_KEY"] = "roadsos-hackathon-2025"

    app.register_blueprint(emergency_bp, url_prefix="/api/emergency")
    app.register_blueprint(routing_bp,   url_prefix="/api/route")
    app.register_blueprint(reports_bp,   url_prefix="/api/reports")

    from flask import render_template
    @app.route("/")
    def index():
        return render_template("index.html")

    return app
app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)