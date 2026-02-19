from app import db
from datetime import datetime

class QuantumResult(db.Model):
    """Modèle résultats quantiques"""
    __tablename__ = 'quantum_results'
    
    # Colonnes
    id = db.Column(db.Integer, primary_key=True)
    transaction_id = db.Column(db.Integer, db.ForeignKey('transactions.id', ondelete='CASCADE'), index=True)
    job_id = db.Column(db.String(100), unique=True)
    
    # Détails du circuit quantique
    algorithm = db.Column(db.String(50), nullable=False, index=True)
    circuit_type = db.Column(db.String(50))
    num_qubits = db.Column(db.Integer)
    circuit_depth = db.Column(db.Integer)
    num_shots = db.Column(db.Integer, default=1024)
    backend = db.Column(db.String(50), default='qasm_simulator')
    
    # Résultats
    execution_time = db.Column(db.Numeric(10, 4))
    prediction = db.Column(db.Integer)
    confidence = db.Column(db.Numeric(5, 4))
    quantum_state = db.Column(db.Text)
    measurement_results = db.Column(db.JSON)
    circuit_image_path = db.Column(db.String(255))
    
    # Statut
    status = db.Column(db.String(20), default='pending', index=True)
    error_message = db.Column(db.Text)
    extra_data = db.Column(db.JSON)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    completed_at = db.Column(db.DateTime)
    
    # Contraintes
    __table_args__ = (
        db.CheckConstraint("algorithm IN ('QRNG', 'BB84', 'VQC', 'QSVM', 'QKD')", 
                          name='check_quantum_algorithm'),
        db.CheckConstraint("status IN ('pending', 'running', 'completed', 'failed')", 
                          name='check_quantum_status'),
    )
    
    def __repr__(self):
        return f'<QuantumResult {self.algorithm} - {self.status}>'