from app import db
from datetime import datetime

class AuditLog(db.Model):
    """Modèle logs d'audit"""
    __tablename__ = 'audit_logs'
    
    # Colonnes
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), index=True)
    
    # Détails du log
    action = db.Column(db.String(100), nullable=False, index=True)
    resource_type = db.Column(db.String(50))
    resource_id = db.Column(db.Integer)
    level = db.Column(db.String(20), default='INFO', nullable=False, index=True)
    message = db.Column(db.Text, nullable=False)
    
    # Métadonnées
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    request_id = db.Column(db.String(100), index=True)
    extra_data = db.Column(db.JSON)
    
    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Contraintes
    __table_args__ = (
        db.CheckConstraint("level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')", 
                          name='check_log_level'),
    )
    
    def __repr__(self):
        return f'<AuditLog {self.action} - {self.level}>'