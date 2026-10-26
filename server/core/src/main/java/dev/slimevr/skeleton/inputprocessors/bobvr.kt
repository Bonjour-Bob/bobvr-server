package dev.slimevr.skeleton.inputprocessors

import dev.slimevr.config.Settings
import dev.slimevr.skeleton.BodyPartMap
import dev.slimevr.skeleton.ComputedSkeleton
import dev.slimevr.skeleton.InputSkeleton
import dev.slimevr.skeleton.ResettableSkeletonProcessor
import dev.slimevr.skeleton.SkeletonInputProcessor
import dev.slimevr.skeleton.bodyPartMap
import dev.slimevr.skeleton.forEachBone
import dev.slimevr.util.MonotonicValueTimeMark
import dev.slimevr.util.inFloatingSeconds
import dev.slimevr.util.timeSource
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import solarxr_protocol.datatypes.BodyPart
import solarxr_protocol.rpc.ResetType
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

// BOBvr: corrections of the mod, all off in the "Origine" profile (modCorrections = false)

// How much the leg roots (and so the knees) follow the pelvis
private const val PELVIS_TILT_ON_LEGS = 0.3f // part of the pelvis tilt / sway
private const val PELVIS_TWIST_FROM_LEGS = 0.7f // heading taken from the thighs
private const val THIGHS_DOWN_MIN = 0.5f // cos 60 deg: legs raised, their heading isn't used
private const val THIGHS_DOWN_FULL = 0.87f // cos 30 deg: legs down, fully used

// The corrections fade out when the pelvis leans, so reclined or lying the body stays straight
private const val PELVIS_LEANING_MAX = 0.77f // cos 40 deg: tilted more, not used
private const val PELVIS_LEANING_FULL = 0.91f // cos 25 deg: tilted less, fully used

// Sitting: part of a slouch is removed, a real lean goes through
private const val SITTING_BACK_STRAIGHTEN = 0.6f
private const val SITTING_SLOUCH_MAX = 0.35f // rad (~20 deg): more than twice this is a real lean
private const val SITTING_THIGH_START = 0.7f // thighs more upright: standing
private const val SITTING_THIGH_FULL = 0.3f // thighs close to flat: sitting

// Sitting on the heels (both legs folded)
private const val HEELS_UPRIGHT_MIN = 0.5f
private const val HEELS_UPRIGHT_FULL = 0.87f
private const val HEELS_SHIN_FLAT_START = 0.6f
private const val HEELS_SHIN_FLAT_FULL = 0.35f
private const val HEELS_SHIN_BACK_START = 0.3f
private const val HEELS_SHIN_BACK_FULL = 0.6f
private const val HEELS_THIGH_FORWARD_START = 0.3f
private const val HEELS_THIGH_FORWARD_FULL = 0.6f
private const val HEELS_MAX_SPREAD = 0.5f // rad (~30 deg) away from straight ahead / straight back
private const val HEELS_THIGH_MAX_UP = 0f // the knee is never higher than the hip
private const val HEELS_SHIN_MAX_TILT = 0.12f // shin about flat on the floor (~7 deg)

// Wi-Fi hiccups: a tracker silent for longer than this, or jumping more than that, glides back
private const val GAP_SECONDS = 0.06f
private const val JUMP_RADIANS = 0.5f // ~30 deg
private const val GLIDE_SECONDS = 0.12f

// Feet are never held on the floor lying down or with the knee on the floor
private const val LOCK_PELVIS_UPRIGHT_MIN = 0.5f // pelvis tilted more than ~60 deg: lying
private const val KNEELING_KNEE_HEIGHT = 0.15f // m above the floor

private val FORWARD = Vector3(0f, 0f, -1f)

fun modCorrectionsOn(settings: Settings): Boolean = settings.context.state.value.data.skeletonConfig.toggles.modCorrections

/** How upright a rotation's bone is: 1 pointing straight down, 0 flat, -1 up */
private fun downness(rotation: Quaternion): Float = -rotation.sandwich(Vector3.NEG_Y).y

private fun ramp(value: Float, start: Float, full: Float): Float = ((value - start) / (full - start)).coerceIn(0f, 1f)

/**
 * The leg roots (hip joints) only take part of the pelvis tilt, and their heading sits between
 * the pelvis and the thighs: big hip moves don't drag the knees, like in real life.
 * FK places the upper legs with the hip rotation, so the head offsets are turned to match.
 */
class ModHipLegsInputProcessor(val settings: Settings) : SkeletonInputProcessor {
	override fun process(mutableInputSkeleton: InputSkeleton, skeletonHeight: Float) {
		if (!modCorrectionsOn(settings)) return
		val hip = mutableInputSkeleton[BodyPart.HIP] ?: return
		val left = mutableInputSkeleton[BodyPart.LEFT_UPPER_LEG] ?: return
		val right = mutableInputSkeleton[BodyPart.RIGHT_UPPER_LEG] ?: return
		if (!left.isRotationActive || !right.isRotationActive) return

		val hipRot = hip.rotation
		val upright = ramp(downness(hipRot), PELVIS_LEANING_MAX, PELVIS_LEANING_FULL)
		if (upright <= 0f) return
		val hipYawRaw = hipRot.project(Vector3.POS_Y)
		if (hipYawRaw.lenSq() < 1e-6f) return
		val hipYaw = hipYawRaw.unit()

		// Thigh heading, only trusted when both point roughly down (raised legs would flip it)
		val legsTrust = ramp(min(downness(left.rotation), downness(right.rotation)), THIGHS_DOWN_MIN, THIGHS_DOWN_FULL)
		var heading = hipYaw
		if (legsTrust > 0f) {
			val legsYaw = left.rotation.interpR(right.rotation, 0.5f).project(Vector3.POS_Y)
			if (legsYaw.lenSq() > 0.01f) heading = hipYaw.interpR(legsYaw.unit(), PELVIS_TWIST_FROM_LEGS * legsTrust * upright)
		}
		val tilt = hipYaw.inv() * hipRot
		val tiltShare = 1f - (1f - PELVIS_TILT_ON_LEGS) * upright
		val legsRot = heading * Quaternion.IDENTITY.interpR(tilt, tiltShare)

		val fix = hipRot.inv() * legsRot
		mutableInputSkeleton[BodyPart.LEFT_UPPER_LEG] = left.copy(headOffset = fix.sandwich(left.headOffset))
		mutableInputSkeleton[BodyPart.RIGHT_UPPER_LEG] = right.copy(headOffset = fix.sandwich(right.headOffset))
	}
}

private val BACK_PARTS = arrayOf(BodyPart.UPPER_CHEST, BodyPart.LOWER_CHEST, BodyPart.UPPER_WAIST, BodyPart.LOWER_WAIST)

/**
 * Sitting slightly slouched, the trackers tilt much more than the spine really bends, so the
 * back looked folded. Only a slouch is straightened, leaning forward on purpose goes through.
 */
class ModSittingBackInputProcessor(val settings: Settings) : SkeletonInputProcessor {
	override fun process(mutableInputSkeleton: InputSkeleton, skeletonHeight: Float) {
		if (!modCorrectionsOn(settings)) return
		val hip = mutableInputSkeleton[BodyPart.HIP] ?: return
		val left = mutableInputSkeleton[BodyPart.LEFT_UPPER_LEG] ?: return
		val right = mutableInputSkeleton[BodyPart.RIGHT_UPPER_LEG] ?: return
		if (!left.isRotationActive || !right.isRotationActive) return

		val thighs = (downness(left.rotation) + downness(right.rotation)) / 2f
		val sitting = ramp(thighs, SITTING_THIGH_START, SITTING_THIGH_FULL)
		val notLying = ramp(downness(hip.rotation), PELVIS_LEANING_MAX, PELVIS_LEANING_FULL)
		val amount = SITTING_BACK_STRAIGHTEN * sitting * notLying
		if (amount <= 0f) return

		for (part in BACK_PARTS) {
			val bone = mutableInputSkeleton[part] ?: continue
			val yawRaw = bone.rotation.project(Vector3.POS_Y)
			if (yawRaw.lenSq() < 1e-6f) continue
			val yaw = yawRaw.unit()
			val tilt = bone.rotation.angleToR(yaw)
			val share = when {
				tilt <= SITTING_SLOUCH_MAX -> amount
				tilt < 2f * SITTING_SLOUCH_MAX -> amount * (2f * SITTING_SLOUCH_MAX - tilt) / tilt
				else -> 0f
			}
			if (share <= 0f) continue
			mutableInputSkeleton[part] = bone.copy(rotation = bone.rotation.interpR(yaw, share))
		}
	}
}

/** How much one leg is in the "sitting on the heels" pose */
private fun heelsLegWeight(thighDir: Vector3, shinDir: Vector3, forward: Vector3): Float {
	if (shinDir.y > HEELS_SHIN_FLAT_FULL) return 0f // foot higher than the knee
	val flat = ramp(abs(shinDir.y), HEELS_SHIN_FLAT_START, HEELS_SHIN_FLAT_FULL)
	val back = ramp(-shinDir.dot(forward), HEELS_SHIN_BACK_START, HEELS_SHIN_BACK_FULL)
	val ahead = ramp(thighDir.dot(forward), HEELS_THIGH_FORWARD_START, HEELS_THIGH_FORWARD_FULL)
	return flat * back * ahead
}

/** [direction] turned around the vertical to at most HEELS_MAX_SPREAD from [center], its height kept within [minY, maxY] */
private fun limitDirection(direction: Vector3, center: Vector3, minY: Float, maxY: Float): Vector3 {
	val y = direction.y.coerceIn(minY, maxY)
	val flatLength = sqrt(max(1f - y * y, 0f))
	val flat = Vector3(direction.x, 0f, direction.z)
	var heading = center
	if (flat.lenSq() > 1e-6f) {
		val h = flat.unit()
		val angle = atan2(center.z * h.x - center.x * h.z, center.dot(h)).coerceIn(-HEELS_MAX_SPREAD, HEELS_MAX_SPREAD)
		heading = Quaternion.rotationAroundYAxis(angle).sandwich(center)
	}
	return Vector3(heading.x * flatLength, y, heading.z * flatLength)
}

private fun isFinite(q: Quaternion): Boolean = q.w.isFinite() && q.x.isFinite() && q.y.isFinite() && q.z.isFinite()

/**
 * Sitting on the heels the trackers slide on the legs and their small mounting errors show a lot:
 * the legs looked raised or spread to the sides. Only when both legs are folded (thigh forward,
 * shin flat and backward), the thigh stays within ~30 deg of straight ahead and never points up,
 * and the shin lies about flat under it. Standing on one leg with the other heel up isn't touched.
 */
class ModHeelsInputProcessor(val settings: Settings) : SkeletonInputProcessor {
	private val legs = arrayOf(
		BodyPart.LEFT_UPPER_LEG to BodyPart.LEFT_LOWER_LEG,
		BodyPart.RIGHT_UPPER_LEG to BodyPart.RIGHT_LOWER_LEG,
	)

	override fun process(mutableInputSkeleton: InputSkeleton, skeletonHeight: Float) {
		if (!modCorrectionsOn(settings)) return
		val hip = mutableInputSkeleton[BodyPart.HIP] ?: return
		val upright = ramp(downness(hip.rotation), HEELS_UPRIGHT_MIN, HEELS_UPRIGHT_FULL)
		if (upright <= 0f) return
		val forwardRaw = hip.rotation.project(Vector3.POS_Y).let { if (it.lenSq() < 1e-6f) return else it.unit() }.sandwich(FORWARD)
		val forwardFlat = Vector3(forwardRaw.x, 0f, forwardRaw.z)
		if (forwardFlat.lenSq() < 1e-6f) return
		val forward = forwardFlat.unit()

		var bothLegs = 1f
		for ((upperPart, lowerPart) in legs) {
			val upper = mutableInputSkeleton[upperPart] ?: return
			val lower = mutableInputSkeleton[lowerPart] ?: return
			if (!upper.isRotationActive || !lower.isRotationActive) return
			bothLegs = min(bothLegs, heelsLegWeight(upper.rotation.sandwich(Vector3.NEG_Y), lower.rotation.sandwich(Vector3.NEG_Y), forward))
		}
		if (bothLegs <= 0f) return

		for ((upperPart, lowerPart) in legs) {
			val upper = mutableInputSkeleton[upperPart] ?: continue
			val lower = mutableInputSkeleton[lowerPart] ?: continue
			val thighDir = upper.rotation.sandwich(Vector3.NEG_Y)
			val shinDir = lower.rotation.sandwich(Vector3.NEG_Y)
			val weight = upright * bothLegs * heelsLegWeight(thighDir, shinDir, forward)
			if (weight <= 0f) continue

			val newThigh = limitDirection(thighDir, forward, -1f, HEELS_THIGH_MAX_UP)
			val thighFlat = Vector3(newThigh.x, 0f, newThigh.z)
			val behind = if (thighFlat.lenSq() > 1e-6f) -thighFlat.unit() else -forward
			val newShin = limitDirection(shinDir, behind, -HEELS_SHIN_MAX_TILT, HEELS_SHIN_MAX_TILT)

			val thighFix = Quaternion.IDENTITY.interpR(Quaternion.fromTo(thighDir, newThigh), weight)
			val shinFix = Quaternion.IDENTITY.interpR(Quaternion.fromTo(shinDir, newShin), weight)
			if (!isFinite(thighFix) || !isFinite(shinFix)) continue
			mutableInputSkeleton[upperPart] = upper.copy(rotation = thighFix * upper.rotation)
			mutableInputSkeleton[lowerPart] = lower.copy(rotation = shinFix * lower.rotation)
		}
	}
}

/**
 * When a tracker comes back after a Wi-Fi hiccup (or jumps), its body part glides to the new
 * rotation instead of snapping to it. Runs first, on the raw tracker data.
 */
class ModGapGlideInputProcessor(val settings: Settings) :
	SkeletonInputProcessor,
	ResettableSkeletonProcessor {
	private class GlideState(
		var input: Quaternion,
		var lastChange: MonotonicValueTimeMark,
		var output: Quaternion,
	) {
		var glideFrom: Quaternion? = null
		var glideStart: MonotonicValueTimeMark = lastChange
	}

	private val states: BodyPartMap<GlideState> = bodyPartMap()

	override fun process(mutableInputSkeleton: InputSkeleton, skeletonHeight: Float) {
		if (!modCorrectionsOn(settings)) {
			if (states.isNotEmpty()) states.clear()
			return
		}
		val now = timeSource.markNow()
		mutableInputSkeleton.forEachBone { bodyPart, bone ->
			if (!bone.isRotationActive) {
				states.remove(bodyPart)
				return@forEachBone
			}
			val state = states[bodyPart]
			if (state == null) {
				states[bodyPart] = GlideState(bone.rotation, now, bone.rotation)
				return@forEachBone
			}
			// A new packet is a new rotation object (same check as the prediction)
			if (bone.rotation !== state.input) {
				val gap = (now - state.lastChange).inFloatingSeconds
				if (gap > GAP_SECONDS || state.input.angleToR(bone.rotation) > JUMP_RADIANS) {
					state.glideFrom = state.output
					state.glideStart = now
				}
				state.input = bone.rotation
				state.lastChange = now
			}
			var output = bone.rotation
			val from = state.glideFrom
			if (from != null) {
				val t = ((now - state.glideStart).inFloatingSeconds / GLIDE_SECONDS).coerceIn(0f, 1f)
				output = from.interpQ(bone.rotation, t * t * (3f - 2f * t))
				if (t >= 1f) state.glideFrom = null
			}
			state.output = output
			if (output !== bone.rotation) mutableInputSkeleton[bodyPart] = bone.copy(rotation = output)
		}
	}

	override fun reset(resetType: ResetType) {
		states.clear()
	}
}

/**
 * Lying down (pelvis tilted more than ~60 deg) or with the knee on the floor, a foot must never be
 * held on the floor by the skating correction.
 */
fun modNoFootLock(settings: Settings, inputSkeleton: InputSkeleton, fk: ComputedSkeleton, floorLevel: Float, upperLeg: BodyPart): Boolean {
	if (!modCorrectionsOn(settings)) return false
	val hip = inputSkeleton[BodyPart.HIP]
	if (hip != null && downness(hip.rotation) < LOCK_PELVIS_UPRIGHT_MIN) return true
	val knee = fk[upperLeg]?.tailPosition ?: return false
	return knee.y - floorLevel < KNEELING_KNEE_HEIGHT
}
