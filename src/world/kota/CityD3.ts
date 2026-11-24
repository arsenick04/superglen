import type * as THREE from 'three';
import type { LevelContext } from '../Level';
import { BikeSystem } from './Bike';
import { CityCare } from './CityCare';
import { CityCoins } from './CityCoins';
import type { CityMap } from './CityMap';
import { CITY_LAYOUT } from './CityData';
import { CityPeople } from './CityPeople';
import { Signposts } from './Signposts';

/**
 * PACKAGE D3: what fills Kota Botanica once Chapter 1 is done (and in the `?level=kota` free roam): coins, bikes, residents with
 * small missions, signposts. KotaLevel builds this after the streamer and ticks it; it is never built during the Chapter 1 walk.
 * Placement data: `CITY_LAYOUT.places` (CityPlaces.ts).
 */
export class CityD3 {
  readonly coins: CityCoins;
  readonly bike: BikeSystem;
  readonly people: CityPeople;
  readonly signs: Signposts;
  readonly care: CityCare;

  constructor(
    private readonly ctx: LevelContext,
    lit: THREE.Material,
    map: CityMap,
    canOffer: () => boolean,
  ) {
    const P = CITY_LAYOUT.places;
    this.signs = new Signposts(ctx, P.signs, P.signDests);
    this.coins = new CityCoins(ctx, P.coins);
    this.bike = new BikeSystem(ctx, lit, P.bikes);
    this.people = new CityPeople(ctx, lit, P.residents, P.missions, this.bike, canOffer);
    this.care = new CityCare(ctx, lit);
    // Map: residents with a mission to give (mini map and full map) and parked bikes (full map).
    map.d3 = { residents: () => this.people.availableSpots(), bikes: () => this.bike.parked(), care: () => this.care.spots() };
    this.bike.onChange = () => map.invalidate();
    this.people.onChange = () => map.invalidate();
    ctx.quiz.coinsChanged();
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      const w = window as unknown as { __d3?: unknown };
      w.__d3 = {
        coins: () => this.coins.list(),
        people: () => this.people.list(),
        bikes: () => this.bike.list(),
        ride: () => this.bike.rideInfo(),
        places: () => P,
        drop: () => this.people.drop(),
        ring: () => this.bike.ring(),
      };
      ctx.onDispose(() => {
        delete w.__d3;
      });
    }
  }

  fixedUpdate(dt: number): void {
    this.bike.fixedUpdate(dt);
    this.people.fixedUpdate(dt);
    this.coins.fixedUpdate(dt);
    this.care.fixedUpdate();
  }

  update(dt: number): void {
    this.coins.update(dt);
    this.bike.update();
    this.people.update(dt);
    const info = this.ctx.game.debugInfo;
    info.d3Coins = this.coins.taken;
    info.d3CoinsNow = this.coins.takenNow;
    info.d3CoinTotal = this.coins.total;
    info.d3CoinsVisible = this.coins.visible;
    info.d3Riding = this.bike.isRiding;
    info.d3Mounts = this.bike.mounts;
    info.d3Dismounts = this.bike.dismounts;
    info.d3Bells = this.bike.bells;
    info.d3Mission = this.people.activeId;
    info.d3Finished = this.people.finished;
    info.d3Dropped = this.people.dropped;
    info.d3Signs = this.signs.count;
    info.d3Bikes = CITY_LAYOUT.places.bikes.length;
    info.d3Residents = CITY_LAYOUT.places.residents.length;
  }
}
