def fuse_scores(email_score=None, audio_score=None, video_score=None):
    # Shifted to Equal Weighting to prevent NLP over-indexing
    weights = {"email": 0.3333, "audio": 0.3333, "video": 0.3333} 
    
    scores = {}
    if email_score is not None: scores["email"] = float(email_score)
    if audio_score is not None: scores["audio"] = float(audio_score)
    if video_score is not None: scores["video"] = float(video_score)
    
    if not scores:
        return None
        
    # 1. CRITICAL THREAT OVERRIDE (The Veto)
    if scores.get("audio", 0.0) >= 0.85 or scores.get("video", 0.0) >= 0.85:
        return max(scores.values()) 
        
    # 2. EQUAL-WEIGHT DYNAMIC FUSION
    total_weight = sum(weights[k] for k in scores.keys())
    fused_score = sum(scores[k] * weights[k] for k in scores.keys()) / total_weight
    
    return fused_score