package dev.slimevr.config

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import solarxr_protocol.rpc.FilteringType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class BobvrProfilesTest {
	@Test
	fun `the mod profiles are created once and Normal is selected the first time`() = runTest {
		val storage = MemoryStorage()
		val config = AppConfig.create(backgroundScope, storage)

		config.seedModProfiles()
		assertEquals(MOD_PROFILE_NORMAL, config.settings.context.state.value.name)
		assertTrue(config.profiles.value.settings.names.containsAll(MOD_PROFILES))
		val normal = config.settings.context.state.value.data
		assertEquals(FilteringType.SMOOTHING, normal.skeletonConfig.filtering.type)
		assertEquals(0.2f, normal.resetsConfig.yawResetSmoothTime)
		assertTrue(normal.skeletonConfig.toggles.modCorrections)

		// Later starts keep the user's choice
		config.switchProfile(solarxr_protocol.rpc.ProfileKind.SETTINGS, MOD_PROFILE_ORIGIN)
		config.seedModProfiles()
		assertEquals(MOD_PROFILE_ORIGIN, config.settings.context.state.value.name)
		assertFalse(config.settings.context.state.value.data.skeletonConfig.toggles.modCorrections)
		assertEquals(SettingsConfigState().skeletonConfig.filtering, config.settings.context.state.value.data.skeletonConfig.filtering)
	}
}
